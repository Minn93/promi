import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BlobAccessError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  del,
  put,
} from "@vercel/blob";
import { isSampleCatalogImageUrl } from "@/lib/mock-data";
import {
  BLOB_UPLOAD_PATH_PREFIX,
  LOCAL_UPLOAD_URL_PREFIX,
  isUploadedScheduledImageUrl,
} from "@/src/lib/media/image-upload";

/** Server-only. Imports node:fs and the Blob SDK; never import from client components. */

export type MediaStorageMode = "blob" | "local" | "unavailable";

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "scheduled-images");
const OWNER_KEY_RE = /^[a-f0-9]{32}$/;
const FILE_NAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/;
const BLOB_HOST_RE = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/;
/** X accepts images up to 5MB; also caps how much the publisher will download. */
const STORED_IMAGE_READ_MAX_BYTES = 5 * 1024 * 1024;
const STORED_IMAGE_FETCH_TIMEOUT_MS = 15_000;

let invalidHostWarned = false;

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/** The single Blob host Promi accepts, from `PROMI_MEDIA_BLOB_HOST` (e.g. `abc123.public.blob.vercel-storage.com`). */
export function getPinnedBlobHost(): string | null {
  const raw = process.env.PROMI_MEDIA_BLOB_HOST?.trim().toLowerCase() ?? "";
  if (!raw) return null;
  if (!BLOB_HOST_RE.test(raw)) {
    if (!invalidHostWarned) {
      console.warn("[media] PROMI_MEDIA_BLOB_HOST is not a public Vercel Blob host; Blob storage is disabled.");
      invalidHostWarned = true;
    }
    return null;
  }
  return raw;
}

function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim());
}

/** Blob when configured; local disk only outside production; otherwise uploads are unavailable (503). */
export function getMediaStorageMode(): MediaStorageMode {
  if (getPinnedBlobHost() && hasBlobCredentials()) return "blob";
  return isProductionRuntime() ? "unavailable" : "local";
}

/** Opaque per-owner folder name, so owner ids never appear in image URLs. */
export function ownerPathKey(ownerId: string): string {
  return createHash("sha256").update(`promi-media-owner:${ownerId}`).digest("hex").slice(0, 32);
}

type ParsedUploadedImage =
  | { kind: "blob"; ownerKey: string; url: string }
  /** `ownerKey` is null for flat legacy dev files uploaded before owner-scoped paths. */
  | { kind: "local"; ownerKey: string | null; segments: string[] };

/** Strict parse: exact canonical form only, so `..`, encoded segments, query strings and other hosts are rejected. */
function parseUploadedImageUrl(raw: string): ParsedUploadedImage | null {
  const value = raw.trim();
  if (value.startsWith(LOCAL_UPLOAD_URL_PREFIX)) {
    const segments = value.slice(LOCAL_UPLOAD_URL_PREFIX.length).split("/");
    if (segments.length === 1 && FILE_NAME_RE.test(segments[0])) {
      return { kind: "local", ownerKey: null, segments };
    }
    if (segments.length === 2 && OWNER_KEY_RE.test(segments[0]) && FILE_NAME_RE.test(segments[1])) {
      return { kind: "local", ownerKey: segments[0], segments };
    }
    return null;
  }

  const host = getPinnedBlobHost();
  if (!host) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.href !== value) return null;
  if (url.protocol !== "https:" || url.hostname !== host || url.port || url.username || url.password) return null;
  if (url.search || url.hash) return null;
  const segments = url.pathname.slice(1).split("/");
  if (
    segments.length !== 3
    || `${segments[0]}/` !== BLOB_UPLOAD_PATH_PREFIX
    || !OWNER_KEY_RE.test(segments[1])
    || !FILE_NAME_RE.test(segments[2])
  ) {
    return null;
  }
  return { kind: "blob", ownerKey: segments[1], url: url.href };
}

export type StoreImageResult =
  | { ok: true; imageUrl: string }
  | { ok: false; reason: "unavailable" | "failed"; details: string };

function isBlobUnavailableError(err: unknown): boolean {
  return (
    err instanceof BlobStoreSuspendedError
    || err instanceof BlobStoreNotFoundError
    || err instanceof BlobAccessError
    || err instanceof BlobServiceNotAvailable
    || err instanceof BlobServiceRateLimited
  );
}

/** Stores one validated image under the owner's folder. Never writes to disk in production. */
export async function storeScheduledImage(ownerId: string, file: File, ext: string): Promise<StoreImageResult> {
  const mode = getMediaStorageMode();
  if (mode === "unavailable") {
    return { ok: false, reason: "unavailable", details: "Durable image storage is not configured." };
  }
  const ownerKey = ownerPathKey(ownerId);
  const filename = `${randomUUID()}.${ext}`;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (mode === "local") {
      const dir = path.join(LOCAL_UPLOAD_DIR, ownerKey);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), bytes);
      return { ok: true, imageUrl: `${LOCAL_UPLOAD_URL_PREFIX}${ownerKey}/${filename}` };
    }

    const blob = await put(`${BLOB_UPLOAD_PATH_PREFIX}${ownerKey}/${filename}`, bytes, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    const parsed = parseUploadedImageUrl(blob.url);
    if (!parsed || parsed.kind !== "blob" || parsed.ownerKey !== ownerKey) {
      await del(blob.url).catch(() => undefined);
      return {
        ok: false,
        reason: "unavailable",
        details: "Blob URL did not match PROMI_MEDIA_BLOB_HOST; check the connected store.",
      };
    }
    return { ok: true, imageUrl: parsed.url };
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: isBlobUnavailableError(err) ? "unavailable" : "failed", details };
  }
}

export type ImageUrlCheck =
  | { ok: true; imageUrl: string | null }
  | { ok: false; code: "INVALID_IMAGE_URL" | "IMAGE_NOT_OWNED" | "IMAGE_UNAVAILABLE"; message: string };

const IMAGE_UNAVAILABLE_MESSAGE = "This image is no longer available. Remove it or upload it again.";
const IMAGE_NOT_OWNED_MESSAGE = "This image can't be used with your account. Remove it or upload it again.";
const INVALID_IMAGE_MESSAGE = "This image can't be used. Remove it or upload it again.";

/**
 * Allowed: no image, an exact sample catalog image, or an upload in this owner's folder
 * (pinned Blob host; legacy local paths outside production only).
 */
export function checkScheduledImageUrlForOwner(raw: string | null | undefined, ownerId: string): ImageUrlCheck {
  const value = raw?.trim() ?? "";
  if (!value) return { ok: true, imageUrl: null };
  if (isSampleCatalogImageUrl(value)) return { ok: true, imageUrl: value };

  const parsed = parseUploadedImageUrl(value);
  if (!parsed) return { ok: false, code: "INVALID_IMAGE_URL", message: INVALID_IMAGE_MESSAGE };
  if (parsed.kind === "local" && isProductionRuntime()) {
    return { ok: false, code: "IMAGE_UNAVAILABLE", message: IMAGE_UNAVAILABLE_MESSAGE };
  }
  if (parsed.ownerKey !== null && parsed.ownerKey !== ownerPathKey(ownerId)) {
    return { ok: false, code: "IMAGE_NOT_OWNED", message: IMAGE_NOT_OWNED_MESSAGE };
  }
  return { ok: true, imageUrl: parsed.kind === "blob" ? parsed.url : value };
}

export type StoredImageRef = ParsedUploadedImage;

export type PublishImageResolution =
  | { kind: "none" }
  | { kind: "attach"; ref: StoredImageRef }
  | { kind: "reject"; message: string };

/** Publish-time re-check against the post owner. Sample and non-upload images stay unattached, as before. */
export function resolvePublishImage(raw: string | null | undefined, ownerId: string | null | undefined): PublishImageResolution {
  const value = raw?.trim() ?? "";
  if (!value || isSampleCatalogImageUrl(value)) return { kind: "none" };

  const parsed = parseUploadedImageUrl(value);
  if (!parsed) {
    return isUploadedScheduledImageUrl(value) ? { kind: "reject", message: INVALID_IMAGE_MESSAGE } : { kind: "none" };
  }
  if (!ownerId?.trim()) return { kind: "reject", message: IMAGE_NOT_OWNED_MESSAGE };
  if (parsed.kind === "local" && isProductionRuntime()) {
    return { kind: "reject", message: IMAGE_UNAVAILABLE_MESSAGE };
  }
  if (parsed.ownerKey !== null && parsed.ownerKey !== ownerPathKey(ownerId)) {
    return { kind: "reject", message: IMAGE_NOT_OWNED_MESSAGE };
  }
  return { kind: "attach", ref: parsed };
}

export type LoadedImage = { bytes: Uint8Array; mimeType: string; filename: string };
export type LoadStoredImageResult = { ok: true; image: LoadedImage } | { ok: false; message: string };

function mimeFromFileName(name: string): string {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/** Reads a resolved upload: local disk (dev) or the pinned Blob host over HTTPS with redirects disabled. */
export async function loadStoredImage(ref: StoredImageRef): Promise<LoadStoredImageResult> {
  if (ref.kind === "local") {
    const filename = ref.segments[ref.segments.length - 1];
    try {
      const bytes = await readFile(path.join(LOCAL_UPLOAD_DIR, ...ref.segments));
      if (bytes.byteLength > STORED_IMAGE_READ_MAX_BYTES) return { ok: false, message: "Image must be 5MB or smaller." };
      return { ok: true, image: { bytes, mimeType: mimeFromFileName(filename), filename } };
    } catch {
      return { ok: false, message: IMAGE_UNAVAILABLE_MESSAGE };
    }
  }

  let response: Response;
  try {
    response = await fetch(ref.url, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(STORED_IMAGE_FETCH_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, message: "Could not download the post image. Try again later." };
  }
  if (!response.ok) {
    return {
      ok: false,
      message: response.status === 404 ? IMAGE_UNAVAILABLE_MESSAGE : `Could not download the post image (${response.status}).`,
    };
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > STORED_IMAGE_READ_MAX_BYTES) return { ok: false, message: "Image must be 5MB or smaller." };
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > STORED_IMAGE_READ_MAX_BYTES) return { ok: false, message: "Image must be 5MB or smaller." };
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const filename = ref.url.slice(ref.url.lastIndexOf("/") + 1);
  return { ok: true, image: { bytes, mimeType, filename } };
}

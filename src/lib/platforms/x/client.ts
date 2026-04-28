import { PlatformPublishError, PUBLISH_ERROR_CODES } from "@/src/lib/platforms/core/errors";
import { IMAGE_UPLOAD_MAX_BYTES, isAllowedImageMime } from "@/src/lib/media/image-upload";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_X_API_BASE_URL = "https://api.x.com";

export function getXApiBaseUrl() {
  return process.env.X_API_BASE_URL?.trim() || DEFAULT_X_API_BASE_URL;
}

export function getXConfig() {
  const rawRealFlag = process.env.X_REAL_PUBLISHING?.trim() ?? "";
  const enableRealPublish = rawRealFlag === "1";
  const apiBaseUrl = getXApiBaseUrl();
  return {
    enableRealPublish,
    rawRealFlag,
    apiBaseUrl,
    hasClientConfig: Boolean(process.env.X_CLIENT_ID?.trim() && process.env.X_CLIENT_SECRET?.trim()),
  };
}

function readErrorDetail(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail.trim();
  if (typeof obj.title === "string" && obj.title.trim()) return obj.title.trim();
  if (Array.isArray(obj.errors) && obj.errors.length > 0) {
    const first = obj.errors[0];
    if (first && typeof first === "object") {
      const msg = (first as Record<string, unknown>).message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
  }
  return null;
}

function classifyNonOkResponse(status: number, detail: string | null): never {
  if (status === 401) {
    throw new PlatformPublishError(PUBLISH_ERROR_CODES.AUTH_EXPIRED, "X authorization failed (401).");
  }
  if (status === 403) {
    throw new PlatformPublishError(PUBLISH_ERROR_CODES.AUTH_REVOKED, "X access forbidden (403).");
  }
  if (status === 402) {
    const detailText = detail?.trim() ?? "";
    const isCreditsDepleted = /credits\s*depleted|creditsdepleted/i.test(detailText);
    throw new PlatformPublishError(
      PUBLISH_ERROR_CODES.PLATFORM_FAILURE,
      isCreditsDepleted || !detailText
        ? "X publishing is temporarily unavailable because your X API credits are depleted. Please add credits in the X developer account, then retry."
        : `X API payment/credits issue (402): ${detailText}`,
    );
  }
  if (status === 429) {
    throw new PlatformPublishError(PUBLISH_ERROR_CODES.RATE_LIMITED, "X rate limit reached.", true);
  }
  if (status >= 500) {
    throw new PlatformPublishError(
      PUBLISH_ERROR_CODES.PROVIDER_UNAVAILABLE,
      `X API unavailable (${status}).`,
      true,
    );
  }
  throw new PlatformPublishError(
    PUBLISH_ERROR_CODES.PLATFORM_FAILURE,
    detail || `X publish failed (${status}).`,
  );
}

export async function createXPost(accessToken: string, payload: { text: string; media?: { media_ids: string[] } }) {
  const { apiBaseUrl } = getXConfig();
  const url = `${apiBaseUrl.replace(/\/+$/, "")}/2/tweets`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    classifyNonOkResponse(response.status, readErrorDetail(body));
  }

  return body;
}

type LoadedMedia = { bytes: Uint8Array; mimeType: string; filename: string };

async function loadMediaFromPath(mediaUrl: string): Promise<LoadedMedia> {
  const normalized = mediaUrl.replace(/\\/g, "/");
  const relative = normalized.replace(/^\/+/, "");
  const absolute = path.resolve(process.cwd(), "public", relative);
  const publicRoot = path.resolve(process.cwd(), "public");
  if (!absolute.startsWith(publicRoot)) {
    throw new PlatformPublishError(PUBLISH_ERROR_CODES.PLATFORM_FAILURE, "Invalid local image path.");
  }
  const bytes = await readFile(absolute);
  const ext = path.extname(absolute).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { bytes, mimeType, filename: path.basename(absolute) };
}

async function loadMediaFromHttp(mediaUrl: string): Promise<LoadedMedia> {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new PlatformPublishError(
      PUBLISH_ERROR_CODES.PLATFORM_FAILURE,
      `Could not download image (${response.status}).`,
    );
  }
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "application/octet-stream";
  const filename = (() => {
    try {
      const pathname = new URL(mediaUrl).pathname;
      const base = pathname.split("/").pop();
      return base && base.trim() ? base : "scheduled-image";
    } catch {
      return "scheduled-image";
    }
  })();
  return { bytes: new Uint8Array(buffer), mimeType: contentType, filename };
}

export async function uploadXMediaFromUrl(accessToken: string, mediaUrl: string): Promise<string> {
  const { apiBaseUrl } = getXConfig();
  const loaded = mediaUrl.startsWith("/")
    ? await loadMediaFromPath(mediaUrl)
    : await loadMediaFromHttp(mediaUrl);

  if (!isAllowedImageMime(loaded.mimeType)) {
    throw new PlatformPublishError(PUBLISH_ERROR_CODES.VALIDATION_FAILED, "Only jpg, jpeg, png, and webp images are supported.");
  }
  if (loaded.bytes.byteLength > IMAGE_UPLOAD_MAX_BYTES) {
    throw new PlatformPublishError(PUBLISH_ERROR_CODES.VALIDATION_FAILED, "Image must be 5MB or smaller.");
  }

  const exactBuffer = loaded.bytes.buffer.slice(
    loaded.bytes.byteOffset,
    loaded.bytes.byteOffset + loaded.bytes.byteLength,
  ) as ArrayBuffer;
  const mediaUploadUrl = `${apiBaseUrl.replace(/\/+$/, "")}/2/media/upload`;
  const sendMediaUploadForm = async (_step: "DIRECT_UPLOAD", form: FormData) => {
    const response = await fetch(mediaUploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      classifyNonOkResponse(response.status, readErrorDetail(body));
    }
    return body;
  };

  const uploadForm = new FormData();
  uploadForm.append("media", new Blob([exactBuffer], { type: loaded.mimeType }), loaded.filename);
  uploadForm.append("media_type", loaded.mimeType);
  uploadForm.append("media_category", "tweet_image");
  const uploadBody = await sendMediaUploadForm("DIRECT_UPLOAD", uploadForm);

  const mediaId = (() => {
    if (!uploadBody || typeof uploadBody !== "object" || Array.isArray(uploadBody)) return null;
    const obj = uploadBody as Record<string, unknown>;
    const data = obj.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const id = (data as Record<string, unknown>).id;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
    const id = obj.media_id_string ?? obj.media_id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  })();
  if (!mediaId) {
    throw new PlatformPublishError(PUBLISH_ERROR_CODES.PLATFORM_FAILURE, "X media upload did not return media id.");
  }

  return mediaId;
}

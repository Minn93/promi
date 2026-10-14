/** Kept below Vercel's 4.5MB function request-body limit (multipart overhead included). */
export const IMAGE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024; // 4MB

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

/** Local-disk uploads (development only). */
export const LOCAL_UPLOAD_URL_PREFIX = "/uploads/scheduled-images/";
/** Pathname prefix of uploads inside the Vercel Blob store. */
export const BLOB_UPLOAD_PATH_PREFIX = "scheduled-images/";
const BLOB_PUBLIC_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * True when the URL has the shape of an image uploaded through Promi (local dev or Vercel Blob).
 * UI hint only (previews, "will be attached" copy). The server pins the Blob host and checks ownership.
 */
export function isUploadedScheduledImageUrl(url: string | null | undefined): boolean {
  const value = url?.trim() ?? "";
  if (value.startsWith(LOCAL_UPLOAD_URL_PREFIX)) return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:"
      && parsed.hostname.endsWith(BLOB_PUBLIC_HOST_SUFFIX)
      && parsed.pathname.startsWith(`/${BLOB_UPLOAD_PATH_PREFIX}`)
    );
  } catch {
    return false;
  }
}

export function extensionFromName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

export function isAllowedImageByName(name: string): boolean {
  const ext = extensionFromName(name);
  return ext ? ALLOWED_IMAGE_EXTENSIONS.has(ext) : false;
}

export function isAllowedImageMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return ALLOWED_IMAGE_MIME_TYPES.has(mime.toLowerCase());
}

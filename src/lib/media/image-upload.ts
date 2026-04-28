export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

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

/**
 * Text sent to platform publishers. Shared by the server publish path and the Create preview so
 * the preview always matches what is posted. Hashtags are intentionally not included.
 */
export function composePublishText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const data = payload as Record<string, unknown>;
  return [
    String(data.instagramCaption ?? "").trim(),
    String(data.pinterestTitle ?? "").trim(),
    String(data.pinterestDescription ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

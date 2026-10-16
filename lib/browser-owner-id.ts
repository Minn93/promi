/** Signed-in id from `<body data-promi-owner-id>`, the same source drafts use. */
export function readPromiBrowserOwnerId(): string {
  if (typeof document === "undefined") return "";
  return document.body?.dataset?.promiOwnerId?.trim() ?? "";
}

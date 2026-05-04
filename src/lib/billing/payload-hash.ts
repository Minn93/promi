import { createHash } from "node:crypto";

/** SHA-256 hex of the raw webhook body (used for bookkeeping, not secrecy). */
export function sha256HexUtf8(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

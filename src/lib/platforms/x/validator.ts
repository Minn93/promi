import type { PublishInput, ValidationResult } from "@/src/lib/platforms/core/types";

const X_MAX_TEXT_LENGTH = 280;

export function validateXInput(input: PublishInput): ValidationResult {
  const text = input.text.trim();
  if (!text) {
    return { ok: false, message: "X post text is empty.", fieldErrors: { text: "Required." } };
  }
  if (text.length > X_MAX_TEXT_LENGTH) {
    return {
      ok: false,
      message: `X text exceeds ${X_MAX_TEXT_LENGTH} characters.`,
      fieldErrors: { text: `Maximum ${X_MAX_TEXT_LENGTH} characters.` },
    };
  }
  return { ok: true };
}

export { X_MAX_TEXT_LENGTH };

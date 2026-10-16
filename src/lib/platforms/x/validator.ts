import type { PublishInput, ValidationResult } from "@/src/lib/platforms/core/types";
import { X_MAX_WEIGHTED_LENGTH, xWeightedLength } from "@/src/lib/services/posts/publish-text";

const X_MAX_TEXT_LENGTH = X_MAX_WEIGHTED_LENGTH;

export function validateXInput(input: PublishInput): ValidationResult {
  const text = input.text.trim();
  if (!text) {
    return { ok: false, message: "X post text is empty.", fieldErrors: { text: "Required." } };
  }
  if (xWeightedLength(text) > X_MAX_TEXT_LENGTH) {
    return {
      ok: false,
      message: `X text exceeds ${X_MAX_TEXT_LENGTH} characters.`,
      fieldErrors: { text: `Maximum ${X_MAX_TEXT_LENGTH} characters.` },
    };
  }
  return { ok: true };
}

export { X_MAX_TEXT_LENGTH };

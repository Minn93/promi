import { PlatformPublishError, PUBLISH_ERROR_CODES } from "@/src/lib/platforms/core/errors";
import type { PlatformPublisher, PublishInput, PublishResult, ValidationResult } from "@/src/lib/platforms/core/types";

export class MockPlatformPublisher implements PlatformPublisher {
  readonly platform;

  constructor(platform: PlatformPublisher["platform"]) {
    this.platform = platform;
  }

  validate(input: PublishInput): ValidationResult {
    if (!input.accountId.trim()) {
      return { ok: false, message: "Missing account id.", fieldErrors: { accountId: "Required." } };
    }
    if (!input.text.trim()) {
      return { ok: false, message: "Content is empty.", fieldErrors: { text: "Required." } };
    }
    if (input.text.length > 280 && this.platform === "x") {
      return {
        ok: false,
        message: "Content exceeds platform limits.",
        fieldErrors: { text: "Must be 280 characters or less for X." },
      };
    }
    return { ok: true };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (input.text.includes("[fail]")) {
      throw new PlatformPublishError(
        PUBLISH_ERROR_CODES.PLATFORM_FAILURE,
        "Mock publish failure triggered by [fail] token.",
      );
    }

    const id = `mock_${this.platform}_${Math.random().toString(36).slice(2, 10)}`;
    return {
      providerPostId: id,
      providerUrl: `https://mock.local/${this.platform}/posts/${id}`,
      message: `Published to ${this.platform} (mock).`,
    };
  }
}

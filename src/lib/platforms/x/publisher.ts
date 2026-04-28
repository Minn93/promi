import { MockPlatformPublisher } from "@/src/lib/platforms/mock/publisher";
import { createXPost, getXConfig, uploadXMediaFromUrl } from "@/src/lib/platforms/x/client";
import { mapFromXCreateTweetResponse, mapToXCreateTweetPayload } from "@/src/lib/platforms/x/mapper";
import { validateXInput } from "@/src/lib/platforms/x/validator";
import { PlatformPublishError, PUBLISH_ERROR_CODES } from "@/src/lib/platforms/core/errors";
import type { PlatformPublisher, PublishInput, PublishResult, ValidationResult } from "@/src/lib/platforms/core/types";

export class XPlatformPublisher implements PlatformPublisher {
  readonly platform = "x" as const;
  private readonly mock = new MockPlatformPublisher("x");

  async validate(input: PublishInput): Promise<ValidationResult> {
    const basic = validateXInput(input);
    if (!basic.ok) return basic;

    const config = getXConfig();
    if (!config.enableRealPublish) {
      return this.mock.validate(input);
    }
    if (input.isMockAccount || input.externalAccountId?.startsWith("mock-") || input.accessToken?.startsWith("mock-")) {
      throw new PlatformPublishError(
        PUBLISH_ERROR_CODES.AUTH_EXPIRED,
        "Mock/dev X account cannot be used when X_REAL_PUBLISHING=1. Reconnect with a real X account.",
      );
    }
    if (!config.hasClientConfig) {
      throw new PlatformPublishError(
        PUBLISH_ERROR_CODES.CONFIGURATION_ERROR,
        `X OAuth config is missing (X_CLIENT_ID/X_CLIENT_SECRET). X_REAL_PUBLISHING='${config.rawRealFlag || "<empty>"}'`,
      );
    }

    if (!input.accessToken?.trim()) {
      throw new PlatformPublishError(
        PUBLISH_ERROR_CODES.AUTH_EXPIRED,
        "X access token is missing for real publish mode.",
      );
    }
    return { ok: true };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const config = getXConfig();
    if (!config.enableRealPublish) {
      const mockResult = await this.mock.publish(input);
      return {
        ...mockResult,
        message: `${mockResult.message} (X real publish disabled: set X_REAL_PUBLISHING=1)`,
      };
    }
    if (input.isMockAccount || input.externalAccountId?.startsWith("mock-") || input.accessToken?.startsWith("mock-")) {
      throw new PlatformPublishError(
        PUBLISH_ERROR_CODES.AUTH_EXPIRED,
        "Mock/dev X account cannot be used when X_REAL_PUBLISHING=1. Reconnect with a real X account.",
      );
    }
    if (!config.hasClientConfig) {
      throw new PlatformPublishError(
        PUBLISH_ERROR_CODES.CONFIGURATION_ERROR,
        `X OAuth config is missing (X_CLIENT_ID/X_CLIENT_SECRET). X_REAL_PUBLISHING='${config.rawRealFlag || "<empty>"}'`,
      );
    }

    if (!input.accessToken?.trim()) {
      throw new PlatformPublishError(
        PUBLISH_ERROR_CODES.AUTH_EXPIRED,
        "X access token is missing for real publish mode.",
      );
    }

    const mediaIds: string[] = [];
    const mediaUrl = input.mediaUrl?.trim() ?? "";
    if (mediaUrl.startsWith("/uploads/scheduled-images/")) {
      const mediaId = await uploadXMediaFromUrl(input.accessToken, mediaUrl);
      mediaIds.push(mediaId);
    }
    const payload = mapToXCreateTweetPayload(input, mediaIds);
    const response = await createXPost(input.accessToken, payload);
    return mapFromXCreateTweetResponse(input, response as { data?: { id?: string }; errors?: Array<{ message?: string }> });
  }
}

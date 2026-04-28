import type { PublishInput, PublishResult } from "@/src/lib/platforms/core/types";
import { PlatformPublishError, PUBLISH_ERROR_CODES } from "@/src/lib/platforms/core/errors";

type XCreateTweetResponse = {
  data?: {
    id?: string;
    text?: string;
  };
  errors?: Array<{ message?: string }>;
};

export function mapToXCreateTweetPayload(input: PublishInput, mediaIds?: string[]) {
  return mediaIds && mediaIds.length > 0
    ? {
      text: input.text.trim(),
      media: {
        media_ids: mediaIds,
      },
    }
    : {
    text: input.text.trim(),
  };
}

export function mapFromXCreateTweetResponse(input: PublishInput, response: XCreateTweetResponse): PublishResult {
  const id = response?.data?.id?.trim();
  if (!id) {
    const apiMessage = response?.errors?.[0]?.message?.trim();
    throw new PlatformPublishError(
      PUBLISH_ERROR_CODES.PLATFORM_FAILURE,
      apiMessage || "X API returned an invalid publish response.",
    );
  }
  return {
    providerPostId: id,
    providerUrl: input.externalAccountId
      ? `https://x.com/i/user/${encodeURIComponent(input.externalAccountId)}/status/${encodeURIComponent(id)}`
      : `https://x.com/i/web/status/${encodeURIComponent(id)}`,
    message: "Published to X.",
    rawResponse: response,
  };
}

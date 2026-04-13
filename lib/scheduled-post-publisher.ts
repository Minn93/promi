import type { ScheduledPost } from "@prisma/client";

export type PublishResult = {
  message: string;
};

/**
 * Shared server-side publish core for scheduled/manual flows.
 * MVP v2: validates payload and simulates successful publishing.
 */
export async function publishScheduledPostCore(post: ScheduledPost): Promise<PublishResult> {
  const channels = Array.isArray(post.channels) ? post.channels : [];
  if (channels.length === 0) {
    throw new Error("Publish failed: no channels configured.");
  }

  if (!post.contentPayload || typeof post.contentPayload !== "object") {
    throw new Error("Publish failed: invalid content payload.");
  }

  return { message: "Published successfully." };
}

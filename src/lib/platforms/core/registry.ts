import { PlatformPublishError, PUBLISH_ERROR_CODES } from "@/src/lib/platforms/core/errors";
import type { Platform, PlatformPublisher } from "@/src/lib/platforms/core/types";

const registry = new Map<Platform, PlatformPublisher>();

export function registerPublisher(publisher: PlatformPublisher) {
  registry.set(publisher.platform, publisher);
}

export function getPublisher(platform: Platform): PlatformPublisher {
  const publisher = registry.get(platform);
  if (!publisher) {
    throw new PlatformPublishError(
      PUBLISH_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      `No publisher registered for platform "${platform}".`,
    );
  }
  return publisher;
}

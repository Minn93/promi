export type PublishPlatform = "x" | "instagram" | "facebook";

const PLATFORM_LABELS: Record<PublishPlatform, string> = {
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
};

export function publishPlatformLabel(platform: string | null | undefined): string {
  if (platform === "x" || platform === "instagram" || platform === "facebook") return PLATFORM_LABELS[platform];
  return "the platform";
}

/** Instagram and Facebook only run the mock publisher; nothing is posted to those networks. */
export function isTestOnlyPlatform(platform: string | null | undefined): boolean {
  return platform === "instagram" || platform === "facebook";
}

export function publishPlatformOptionLabel(platform: PublishPlatform): string {
  return isTestOnlyPlatform(platform) ? `${PLATFORM_LABELS[platform]} — test only, not posted` : PLATFORM_LABELS[platform];
}

export function publishPlatformBadgeLabel(platform: string | null | undefined): string {
  const label = publishPlatformLabel(platform);
  return isTestOnlyPlatform(platform) ? `${label} (test only)` : label;
}

export function testPublishNotice(platform: string | null | undefined): string {
  return `Test publish — not posted to ${publishPlatformLabel(platform)}.`;
}

/** Publisher messages can carry dev wording such as "(mock)"; never show that as a real post. */
export function toUserFacingPublishMessage(message: string | null, platform: string | null | undefined): string | null {
  if (!message) return message;
  if (/\(mock\)/i.test(message) || /real publish disabled/i.test(message)) {
    return testPublishNotice(platform);
  }
  return message;
}

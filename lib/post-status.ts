export const INTERNAL_POST_STATUSES = [
  "draft",
  "scheduled",
  "processing",
  "published",
  "failed",
  "needs_reconnect",
  "cancelled",
] as const;

export type InternalPostStatus = (typeof INTERNAL_POST_STATUSES)[number];

export const POST_STATUS_LABELS: Record<InternalPostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  processing: "Processing",
  published: "Published",
  failed: "Failed",
  needs_reconnect: "Needs Reconnect",
  cancelled: "Cancelled",
};

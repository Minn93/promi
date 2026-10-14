import type { InternalPostStatus } from "@/lib/post-status";

type StatusTone = "default" | "info" | "success" | "warning" | "danger";

export type PostStatusCopy = {
  label: string;
  description: string;
  actionHint: string | null;
  tone: StatusTone;
};

const STATUS_COPY: Record<InternalPostStatus, PostStatusCopy> = {
  draft: {
    label: "Draft",
    description: "Saved on this device. Not scheduled to publish yet.",
    actionHint: "Schedule it when ready.",
    tone: "default",
  },
  scheduled: {
    label: "Scheduled",
    description: "Waiting for its scheduled time.",
    actionHint: null,
    tone: "default",
  },
  processing: {
    label: "Processing",
    description: "Publishing is in progress.",
    actionHint: "Refresh in a minute for updates.",
    tone: "info",
  },
  published: {
    label: "Published",
    description: "Published successfully.",
    actionHint: "Check History or Analytics for outcomes.",
    tone: "success",
  },
  failed: {
    label: "Failed",
    description: "Publishing did not complete.",
    actionHint: "Retry now, or edit and reschedule.",
    tone: "danger",
  },
  needs_reconnect: {
    label: "Needs reconnect",
    description: "Account connection needs attention.",
    actionHint: "Select Reconnect account (it opens in a new tab), then come back and select Retry.",
    tone: "warning",
  },
  cancelled: {
    label: "Cancelled",
    description: "Publishing was cancelled before completion.",
    actionHint: null,
    tone: "default",
  },
};

const UNKNOWN_COPY: PostStatusCopy = {
  label: "Unknown",
  description: "Status is not available yet.",
  actionHint: null,
  tone: "default",
};

const OVERDUE_SCHEDULED_COPY: PostStatusCopy = {
  label: "Scheduled (late)",
  description: "Scheduled time passed. It will publish the next time Promi's publishing job runs.",
  actionHint: "During the beta this can be later than the scheduled time. Check History for the outcome.",
  tone: "warning",
};

export function getPostStatusCopy(status: InternalPostStatus | null, options?: { isOverdue?: boolean }): PostStatusCopy {
  if (options?.isOverdue && status === "scheduled") {
    return OVERDUE_SCHEDULED_COPY;
  }
  if (!status) return UNKNOWN_COPY;
  return STATUS_COPY[status];
}

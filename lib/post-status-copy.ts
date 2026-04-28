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
    description: "Saved on this device. Not in the server queue yet.",
    actionHint: "Schedule it when ready.",
    tone: "default",
  },
  scheduled: {
    label: "Scheduled",
    description: "Waiting in the server queue for publish time.",
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
    actionHint: "Reconnect the account, then retry or reschedule.",
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
  description: "Scheduled time passed. Waiting for the next scheduler pickup.",
  actionHint: "If this stays late, refresh and check History.",
  tone: "warning",
};

export function getPostStatusCopy(status: InternalPostStatus | null, options?: { isOverdue?: boolean }): PostStatusCopy {
  if (options?.isOverdue && status === "scheduled") {
    return OVERDUE_SCHEDULED_COPY;
  }
  if (!status) return UNKNOWN_COPY;
  return STATUS_COPY[status];
}

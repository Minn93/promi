/**
 * Posts that can still publish on their own.
 * failed, needs_reconnect, published, cancelled, and draft do not consume a slot.
 *
 * The count is read before the create or retry write. Two overlapping requests can
 * both observe room and both succeed. That race is accepted for Phase 15.2G.
 */
export const ACTIVE_SCHEDULED_POST_STATUSES = ["scheduled", "processing"] as const;

export type ActiveScheduledPostStatus = (typeof ACTIVE_SCHEDULED_POST_STATUSES)[number];

export function isActiveScheduledPostStatus(status: string): status is ActiveScheduledPostStatus {
  return (ACTIVE_SCHEDULED_POST_STATUSES as readonly string[]).includes(status);
}

export function activeScheduledPostsWhere(ownerId: string): {
  ownerId: string;
  status: { in: ActiveScheduledPostStatus[] };
} {
  return {
    ownerId,
    status: { in: [...ACTIVE_SCHEDULED_POST_STATUSES] },
  };
}

/** Same boundary as plan limits: the limit itself is already full. */
export function isActiveScheduleLimitReached(activeCount: number, limit: number): boolean {
  return activeCount >= limit;
}

export type ScheduledRetryPost = {
  status: string;
  scheduledAt: Date;
  lastError: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  processingStartedAt: Date | null;
};

export type ScheduledRetryPlan =
  | { action: "missing" }
  | { action: "reject_status"; message: string }
  | { action: "unchanged" }
  | { action: "plan_limit" }
  | {
      action: "retry";
      update: {
        status: "scheduled";
        scheduledAt: Date;
        processingStartedAt: null;
        lastError: null;
        errorMessage: null;
        errorCode: null;
      };
      history: { eventType: "retried"; message: "Requeued for retry." };
    };

/**
 * Decides a retry before any write. `plan_limit` carries no update and no history event.
 * Capacity is consulted only for failed and needs_reconnect posts, which are outside the active set.
 */
export function planScheduledRetry(input: {
  post: ScheduledRetryPost | null;
  activeCount: number;
  limit: number;
  now: Date;
}): ScheduledRetryPlan {
  if (!input.post) return { action: "missing" };
  const { status } = input.post;
  if (status === "published" || status === "cancelled" || status === "processing") {
    return { action: "reject_status", message: `Cannot retry post in status ${status}.` };
  }
  if (status !== "failed" && status !== "needs_reconnect") {
    return { action: "unchanged" };
  }
  if (isActiveScheduleLimitReached(input.activeCount, input.limit)) {
    return { action: "plan_limit" };
  }
  return {
    action: "retry",
    update: {
      status: "scheduled",
      scheduledAt: input.now,
      processingStartedAt: null,
      lastError: null,
      errorMessage: null,
      errorCode: null,
    },
    history: { eventType: "retried", message: "Requeued for retry." },
  };
}

/** Cancel is allowed for any `scheduled` row, including overdue. Processing stays blocked in UI. */
export function canCancelScheduledPostInUi(status: string): boolean {
  return status === "scheduled";
}

export function cancelUnavailableReason(status: string): string | null {
  if (status === "processing") {
    return "Can't cancel: this post is being published right now.";
  }
  return null;
}

/** Reschedule is in-place edit of an existing scheduled row — never a new create. */
export function canRescheduleScheduledPost(status: string): boolean {
  return status === "scheduled";
}

export function scheduledPostEditPath(id: string): string {
  return `/scheduled/${encodeURIComponent(id)}/edit`;
}

/**
 * In-place reschedule keeps the same id and status=scheduled, so active_count is unchanged
 * and plan capacity does not apply (unlike POST create or failed/needs_reconnect retry).
 */
export function planInPlaceReschedule(input: {
  status: string;
  activeCount: number;
  limit: number;
}): { action: "edit"; consumesNewSlot: false } | { action: "reject_status" } {
  if (input.status !== "scheduled") return { action: "reject_status" };
  void input.activeCount;
  void input.limit;
  return { action: "edit", consumesNewSlot: false };
}

export type OptimisticCancelResult =
  | { action: "cancelled"; writeHistory: true }
  | { action: "already_cancelled"; writeHistory: false }
  | { action: "conflict"; writeHistory: false }
  | { action: "missing"; writeHistory: false };

/**
 * After `updateMany` where status=scheduled: one update means cancel won;
 * zero means missing, already cancelled, or scheduler/other state won (conflict).
 */
export function interpretOptimisticCancel(input: {
  updatedCount: number;
  currentStatus: string | null;
}): OptimisticCancelResult {
  if (input.updatedCount === 1) return { action: "cancelled", writeHistory: true };
  if (input.currentStatus == null) return { action: "missing", writeHistory: false };
  if (input.currentStatus === "cancelled") {
    return { action: "already_cancelled", writeHistory: false };
  }
  return { action: "conflict", writeHistory: false };
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIVE_SCHEDULED_POST_STATUSES,
  activeScheduledPostsWhere,
  canCancelScheduledPostInUi,
  canRescheduleScheduledPost,
  cancelUnavailableReason,
  interpretOptimisticCancel,
  isActiveScheduleLimitReached,
  isActiveScheduledPostStatus,
  planInPlaceReschedule,
  planScheduledRetry,
  scheduledPostEditPath,
  type ScheduledRetryPlan,
  type ScheduledRetryPost,
} from "./active-scheduled-posts";

const NOW = new Date("2026-10-18T12:00:00.000Z");
const ORIGINAL_AT = new Date("2026-10-01T08:00:00.000Z");

function failedPost(status: "failed" | "needs_reconnect"): ScheduledRetryPost {
  return {
    status,
    scheduledAt: ORIGINAL_AT,
    lastError: "X authorization failed (401).",
    errorMessage: "X authorization failed (401).",
    errorCode: "AUTH_EXPIRED",
    processingStartedAt: null,
  };
}

function commitRetry(post: ScheduledRetryPost, plan: ScheduledRetryPlan, history: unknown[]) {
  if (plan.action !== "retry") return { post, history };
  return {
    post: { ...post, ...plan.update },
    history: [...history, plan.history],
  };
}

describe("active scheduled post statuses", () => {
  it("counts scheduled and processing", () => {
    assert.deepEqual([...ACTIVE_SCHEDULED_POST_STATUSES], ["scheduled", "processing"]);
    assert.equal(isActiveScheduledPostStatus("scheduled"), true);
    assert.equal(isActiveScheduledPostStatus("processing"), true);
  });

  it("does not count failed, needs_reconnect, published, cancelled, or draft", () => {
    for (const status of ["failed", "needs_reconnect", "published", "cancelled", "draft"]) {
      assert.equal(isActiveScheduledPostStatus(status), false);
    }
  });

  it("builds the owner count filter from that status list", () => {
    assert.deepEqual(activeScheduledPostsWhere("owner-1"), {
      ownerId: "owner-1",
      status: { in: ["scheduled", "processing"] },
    });
  });

  it("treats the plan limit as already full", () => {
    assert.equal(isActiveScheduleLimitReached(14, 15), false);
    assert.equal(isActiveScheduleLimitReached(15, 15), true);
    assert.equal(isActiveScheduleLimitReached(299, 300), false);
    assert.equal(isActiveScheduleLimitReached(300, 300), true);
  });
});

describe("scheduled retry capacity", () => {
  it("retries a failed post when active posts are below the limit", () => {
    const original = failedPost("failed");
    const plan = planScheduledRetry({ post: original, activeCount: 14, limit: 15, now: NOW });
    assert.equal(plan.action, "retry");
    const committed = commitRetry(original, plan, []);
    assert.equal(committed.post.status, "scheduled");
    assert.equal(committed.post.scheduledAt.toISOString(), NOW.toISOString());
    assert.equal(committed.post.lastError, null);
    assert.equal(committed.post.errorMessage, null);
    assert.equal(committed.post.errorCode, null);
    assert.deepEqual(committed.history, [{ eventType: "retried", message: "Requeued for retry." }]);
  });

  it("retries a needs_reconnect post when capacity remains", () => {
    const plan = planScheduledRetry({
      post: failedPost("needs_reconnect"),
      activeCount: 0,
      limit: 15,
      now: NOW,
    });
    assert.equal(plan.action, "retry");
  });

  it("rejects a failed post at capacity and leaves the row and history unchanged", () => {
    const original = failedPost("failed");
    const plan = planScheduledRetry({ post: original, activeCount: 15, limit: 15, now: NOW });
    assert.deepEqual(plan, { action: "plan_limit" });
    const committed = commitRetry(original, plan, []);
    assert.deepEqual(committed.post, original);
    assert.deepEqual(committed.history, []);
    assert.equal(committed.post.scheduledAt, ORIGINAL_AT);
    assert.equal(committed.post.lastError, "X authorization failed (401).");
  });

  it("rejects a needs_reconnect post at capacity without a history event", () => {
    const original = failedPost("needs_reconnect");
    const plan = planScheduledRetry({ post: original, activeCount: 300, limit: 300, now: NOW });
    assert.deepEqual(plan, { action: "plan_limit" });
    const committed = commitRetry(original, plan, []);
    assert.deepEqual(committed.post, original);
    assert.deepEqual(committed.history, []);
  });

  it("still blocks retry at the temporary Free smoke limit of 5", () => {
    const plan = planScheduledRetry({
      post: failedPost("failed"),
      activeCount: 5,
      limit: 5,
      now: NOW,
    });
    assert.deepEqual(plan, { action: "plan_limit" });
  });
});

describe("overdue cancel and processing protection", () => {
  it("allows cancel for overdue scheduled posts in the UI", () => {
    assert.equal(canCancelScheduledPostInUi("scheduled"), true);
    assert.equal(cancelUnavailableReason("scheduled"), null);
  });

  it("rejects processing cancel in the UI", () => {
    assert.equal(canCancelScheduledPostInUi("processing"), false);
    assert.equal(
      cancelUnavailableReason("processing"),
      "Can't cancel: this post is being published right now.",
    );
  });

  it("disables cancel for published and cancelled rows", () => {
    assert.equal(canCancelScheduledPostInUi("published"), false);
    assert.equal(canCancelScheduledPostInUi("cancelled"), false);
  });
});

describe("in-place reschedule semantics", () => {
  it("routes reschedule to the existing edit path for scheduled posts", () => {
    assert.equal(canRescheduleScheduledPost("scheduled"), true);
    assert.equal(scheduledPostEditPath("abc-123"), "/scheduled/abc-123/edit");
  });

  it("does not allow reschedule for processing, published, or cancelled", () => {
    for (const status of ["processing", "published", "cancelled", "failed", "needs_reconnect"]) {
      assert.equal(canRescheduleScheduledPost(status), false);
    }
  });

  it("keeps the same active slot at or over the plan limit", () => {
    const atLimit = planInPlaceReschedule({ status: "scheduled", activeCount: 5, limit: 5 });
    assert.deepEqual(atLimit, { action: "edit", consumesNewSlot: false });
    const overLimit = planInPlaceReschedule({ status: "scheduled", activeCount: 8, limit: 5 });
    assert.deepEqual(overLimit, { action: "edit", consumesNewSlot: false });
  });

  it("rejects in-place reschedule for non-scheduled statuses", () => {
    assert.deepEqual(
      planInPlaceReschedule({ status: "processing", activeCount: 0, limit: 5 }),
      { action: "reject_status" },
    );
  });
});

describe("new schedule remains blocked at limit", () => {
  it("treats active_count >= limit as full for create", () => {
    assert.equal(isActiveScheduleLimitReached(5, 5), true);
    assert.equal(isActiveScheduleLimitReached(8, 5), true);
    assert.equal(isActiveScheduleLimitReached(4, 5), false);
  });
});

describe("optimistic cancel race", () => {
  it("writes cancelled history only when the scheduled update wins", () => {
    const won = interpretOptimisticCancel({ updatedCount: 1, currentStatus: "cancelled" });
    assert.deepEqual(won, { action: "cancelled", writeHistory: true });
  });

  it("returns conflict with no history when processing already claimed the row", () => {
    const lost = interpretOptimisticCancel({ updatedCount: 0, currentStatus: "processing" });
    assert.deepEqual(lost, { action: "conflict", writeHistory: false });
  });

  it("returns already_cancelled with no new history when the row is already cancelled", () => {
    const prior = interpretOptimisticCancel({ updatedCount: 0, currentStatus: "cancelled" });
    assert.deepEqual(prior, { action: "already_cancelled", writeHistory: false });
  });

  it("returns missing when the owner row is gone", () => {
    assert.deepEqual(
      interpretOptimisticCancel({ updatedCount: 0, currentStatus: null }),
      { action: "missing", writeHistory: false },
    );
  });
});

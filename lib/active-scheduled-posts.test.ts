import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIVE_SCHEDULED_POST_STATUSES,
  activeScheduledPostsWhere,
  isActiveScheduleLimitReached,
  isActiveScheduledPostStatus,
  planScheduledRetry,
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
});

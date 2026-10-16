import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  historyViewOnXUrl,
  isHistoryReconnectFailure,
  isKnownReconnectPublishMessage,
  presentHistoryEvent,
} from "./history-event-copy.ts";

describe("presentHistoryEvent", () => {
  it("maps stored scheduled messages without rewriting them", () => {
    assert.deepEqual(
      presentHistoryEvent({
        eventType: "scheduled",
        message: "Scheduled post created.",
        platform: "x",
        status: "published",
      }),
      { badge: "Scheduled", supporting: "Queued to publish.", reconnect: false },
    );
    assert.deepEqual(
      presentHistoryEvent({
        eventType: "scheduled",
        message: "Scheduled post updated by user.",
        platform: "x",
        status: "scheduled",
      }),
      { badge: "Updated", supporting: "The scheduled post was edited.", reconnect: false },
    );
  });

  it("maps retry, cancel, X publish, and test publish", () => {
    assert.equal(presentHistoryEvent({ eventType: "retried", message: "Requeued for retry.", platform: "x", status: "scheduled" }).badge, "Retried");
    assert.equal(presentHistoryEvent({ eventType: "cancelled", message: "Scheduled post cancelled.", platform: "x", status: "cancelled" }).supporting, "Publishing was cancelled.");
    assert.deepEqual(
      presentHistoryEvent({ eventType: "published", message: "Published to X.", platform: "x", status: "published" }),
      { badge: "Published", supporting: "Published to X.", reconnect: false },
    );
    const testPublish = presentHistoryEvent({
      eventType: "published",
      message: "Published to instagram (mock).",
      platform: "instagram",
      status: "published",
    });
    assert.equal(testPublish.badge, "Test publish");
    assert.equal(testPublish.supporting, "Test publish — not posted to Instagram.");
  });

  it("labels reconnect failures separately from ordinary failures", () => {
    const reconnect = presentHistoryEvent({
      eventType: "failed",
      message: "X rate limit reached.",
      platform: "x",
      status: "needs_reconnect",
    });
    assert.equal(reconnect.badge, "Reconnect required");
    assert.equal(reconnect.supporting, "Connect the account again, then retry.");

    const ordinary = presentHistoryEvent({
      eventType: "failed",
      message: "X rate limit reached.",
      platform: "x",
      status: "failed",
    });
    assert.equal(ordinary.badge, "Failed");
    assert.equal(ordinary.supporting, null);
    assert.equal(ordinary.reconnect, false);
  });
});

describe("isKnownReconnectPublishMessage", () => {
  it("matches publisher reconnect messages and ignores ordinary failures", () => {
    assert.equal(isKnownReconnectPublishMessage("X authorization failed (401)."), true);
    assert.equal(isKnownReconnectPublishMessage("Connected account is not active (expired)."), true);
    assert.equal(isKnownReconnectPublishMessage("X token refresh failed: invalid_request"), true);
    assert.equal(isKnownReconnectPublishMessage("X rate limit reached."), false);
    assert.equal(isKnownReconnectPublishMessage("X API unavailable (503)."), false);
    assert.equal(isKnownReconnectPublishMessage("X OAuth config is missing (X_CLIENT_ID)."), false);
    assert.equal(
      isHistoryReconnectFailure("scheduled", "X authorization failed (401)."),
      true,
    );
    assert.equal(isHistoryReconnectFailure("needs_reconnect", "X rate limit reached."), true);
  });
});

describe("historyViewOnXUrl", () => {
  const tweet = "https://x.com/i/web/status/123";

  it("allows published X links on x.com and twitter.com", () => {
    assert.equal(historyViewOnXUrl({ eventType: "published", platform: "x", providerUrl: tweet }), tweet);
    assert.equal(
      historyViewOnXUrl({ eventType: "published", platform: "x", providerUrl: "https://twitter.com/user/status/1" }),
      "https://twitter.com/user/status/1",
    );
  });

  it("rejects other events, platforms, schemes, and hosts", () => {
    assert.equal(historyViewOnXUrl({ eventType: "scheduled", platform: "x", providerUrl: tweet }), null);
    assert.equal(historyViewOnXUrl({ eventType: "published", platform: "instagram", providerUrl: tweet }), null);
    assert.equal(historyViewOnXUrl({ eventType: "published", platform: "x", providerUrl: "http://x.com/i/web/status/1" }), null);
    assert.equal(historyViewOnXUrl({ eventType: "published", platform: "x", providerUrl: "https://evil.com/status/1" }), null);
    assert.equal(historyViewOnXUrl({ eventType: "published", platform: "x", providerUrl: "https://www.x.com/i/web/status/1" }), null);
    assert.equal(historyViewOnXUrl({ eventType: "published", platform: "x", providerUrl: "https://user:pass@x.com/i/web/status/1" }), null);
    assert.equal(historyViewOnXUrl({ eventType: "published", platform: "x", providerUrl: "not a url" }), null);
  });
});

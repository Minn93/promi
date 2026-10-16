import { isTestOnlyPlatform, testPublishNotice } from "./publish-platform-copy.ts";

/**
 * Messages persisted when publish sets needs_reconnect.
 * They correspond to the reconnect error codes in `requiresReconnect`
 * (`ACCOUNT_NOT_FOUND`, `ACCOUNT_INACTIVE`, `AUTH_EXPIRED`, `AUTH_REVOKED`,
 * `TOKEN_REFRESH_FAILED`, `X_AUTH_REQUIRED`). History does not store the code.
 */
const EXACT_RECONNECT_MESSAGES = new Set([
  "Connected account was not found for this post.",
  "X access token is missing or expired and no refresh token is stored. Reconnect the account.",
  "X authorization failed (401).",
  "X access forbidden (403).",
  "Mock/dev X account cannot be used when X_REAL_PUBLISHING=1. Reconnect with a real X account.",
  "X access token is missing for real publish mode.",
  "X refresh token is empty.",
  "X token refresh failed.",
]);

const INACTIVE_ACCOUNT_MESSAGE = /^Connected account is not active \((expired|revoked|error)\)\.$/;
const TOKEN_REFRESH_MESSAGE = /^X token refresh failed: \S/;

const SCHEDULED_CREATED_MESSAGE = "Scheduled post created.";
const SCHEDULED_UPDATED_MESSAGE = "Scheduled post updated by user.";

export type HistoryEventPresentation = {
  badge: string;
  /** Null when a failed row should keep the existing plain-language failure reason. */
  supporting: string | null;
  reconnect: boolean;
};

export function isKnownReconnectPublishMessage(message: string | null | undefined): boolean {
  const text = message?.trim() ?? "";
  if (!text) return false;
  if (EXACT_RECONNECT_MESSAGES.has(text)) return true;
  if (INACTIVE_ACCOUNT_MESSAGE.test(text)) return true;
  return TOKEN_REFRESH_MESSAGE.test(text);
}

export function isHistoryReconnectFailure(status: string | null | undefined, message: string | null | undefined): boolean {
  return status === "needs_reconnect" || isKnownReconnectPublishMessage(message);
}

export function presentHistoryEvent(input: {
  eventType: string;
  message: string | null;
  platform: string | null;
  status: string | null;
}): HistoryEventPresentation {
  if (input.eventType === "scheduled" && input.message?.trim() === SCHEDULED_UPDATED_MESSAGE) {
    return { badge: "Updated", supporting: "The scheduled post was edited.", reconnect: false };
  }
  if (input.eventType === "scheduled" && input.message?.trim() === SCHEDULED_CREATED_MESSAGE) {
    return { badge: "Scheduled", supporting: "Queued to publish.", reconnect: false };
  }
  if (input.eventType === "scheduled") {
    return { badge: "Scheduled", supporting: "Queued to publish.", reconnect: false };
  }
  if (input.eventType === "retried") {
    return { badge: "Retried", supporting: "Queued to publish again.", reconnect: false };
  }
  if (input.eventType === "cancelled") {
    return { badge: "Cancelled", supporting: "Publishing was cancelled.", reconnect: false };
  }
  if (input.eventType === "published") {
    if (isTestOnlyPlatform(input.platform)) {
      return { badge: "Test publish", supporting: testPublishNotice(input.platform), reconnect: false };
    }
    if (input.platform === "x") {
      return { badge: "Published", supporting: "Published to X.", reconnect: false };
    }
    return { badge: "Published", supporting: "Published successfully.", reconnect: false };
  }
  if (input.eventType === "failed") {
    if (isHistoryReconnectFailure(input.status, input.message)) {
      return {
        badge: "Reconnect required",
        supporting: "Connect the account again, then retry.",
        reconnect: true,
      };
    }
    return { badge: "Failed", supporting: null, reconnect: false };
  }
  return { badge: "Scheduled", supporting: "Queued to publish.", reconnect: false };
}

/** HTTPS links on x.com or twitter.com only. Returns null for every other URL. */
export function historyViewOnXUrl(input: {
  eventType: string;
  platform: string | null;
  providerUrl: string | null;
}): string | null {
  if (input.eventType !== "published" || input.platform !== "x") return null;
  const raw = input.providerUrl?.trim() ?? "";
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== "x.com" && host !== "twitter.com") return null;
  return url.toString();
}

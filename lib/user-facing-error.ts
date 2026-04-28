export type UserFacingErrorAction = {
  label: string;
  href: string;
};

export type UserFacingError = {
  message: string;
  actions: UserFacingErrorAction[];
};

const AUTH_CODES = new Set([
  "ACCOUNT_INACTIVE",
  "AUTH_EXPIRED",
  "AUTH_REVOKED",
  "ACCOUNT_NOT_FOUND",
  "TOKEN_REFRESH_FAILED",
  "X_AUTH_REQUIRED",
]);

const INPUT_CODES = new Set([
  "INVALID_INPUT",
  "INVALID_JSON",
  "INVALID_STATUS",
  "INVALID_ID",
  "EMPTY_BODY",
  "EMPTY_CONTENT",
  "INVALID_SCHEDULED_AT",
  "SCHEDULED_TIME_IN_PAST",
  "VALIDATION_FAILED",
]);

const TEMPORARY_CODES = new Set([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "UNKNOWN",
]);

export function toUserFacingError(code: string | null, fallbackMessage: string): UserFacingError {
  const normalized = code?.trim().toUpperCase() ?? "";

  if (normalized.startsWith("PLAN_LIMIT_")) {
    return {
      message: "You reached your current plan limit for this action.",
      actions: [{ label: "Upgrade", href: "/upgrade" }],
    };
  }

  if (AUTH_CODES.has(normalized)) {
    return {
      message: "Your account connection needs attention before this can continue.",
      actions: [{ label: "Reconnect account", href: "/settings/accounts" }],
    };
  }

  if (INPUT_CODES.has(normalized)) {
    return {
      message: "Some post details need updates before you continue.",
      actions: [{ label: "Edit post", href: "/create" }],
    };
  }

  if (TEMPORARY_CODES.has(normalized)) {
    return {
      message: "This looks temporary. Please retry in a moment.",
      actions: [],
    };
  }

  if (normalized === "LIST_FAILED") {
    return {
      message: "Could not load this data right now. Please retry.",
      actions: [],
    };
  }

  return {
    message: fallbackMessage,
    actions: [],
  };
}

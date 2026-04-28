export const PUBLISH_ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
  AUTH_EXPIRED: "AUTH_EXPIRED",
  AUTH_REVOKED: "AUTH_REVOKED",
  /** X refresh_token exchange failed or returned no usable access token. */
  TOKEN_REFRESH_FAILED: "TOKEN_REFRESH_FAILED",
  /** Real X publish requires a valid token but none / no refresh path (reconnect OAuth). */
  X_AUTH_REQUIRED: "X_AUTH_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  PLATFORM_NOT_SUPPORTED: "PLATFORM_NOT_SUPPORTED",
  PLATFORM_FAILURE: "PLATFORM_FAILURE",
  UNKNOWN: "UNKNOWN",
} as const;

export type PublishErrorCode = (typeof PUBLISH_ERROR_CODES)[keyof typeof PUBLISH_ERROR_CODES];

export class PlatformPublishError extends Error {
  code: PublishErrorCode;
  retryable: boolean;

  constructor(code: PublishErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "PlatformPublishError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function toPlatformPublishError(err: unknown): PlatformPublishError {
  if (err instanceof PlatformPublishError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new PlatformPublishError(PUBLISH_ERROR_CODES.UNKNOWN, message || "Unknown publish error.");
}

function parseFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/**
 * Internal beta is the default operating mode until intentional non–internal-beta deployments.
 * Production without internal beta requires PROMI_AUTH_PRODUCT_READY=1 (Auth MVP) or the app shell stays blocked.
 */
export function isInternalBetaModeServer(): boolean {
  return parseFlag(process.env.PROMI_INTERNAL_BETA_MODE, true);
}

/**
 * Client-visible mirror of internal beta mode. Keep it aligned with server env.
 */
export function isInternalBetaModeClient(): boolean {
  return parseFlag(process.env.NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE, true);
}

/** When true, Auth.js DB users are required for Credentials sign-in; env AUTH_USER_* is not product auth. */
export function isAuthProductReadyServer(): boolean {
  return parseFlag(process.env.PROMI_AUTH_PRODUCT_READY, false);
}

/**
 * Production app shell blocked: not internal beta and auth MVP flag not enabled.
 * Renders layout safety screen until PROMI_INTERNAL_BETA_MODE=1 or PROMI_AUTH_PRODUCT_READY=1.
 */
export function isUnsafePublicLaunchAttemptServer(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (isInternalBetaModeServer()) return false;
  if (isAuthProductReadyServer()) return false;
  return true;
}

export function getInternalBetaOwnerId(): string {
  const configured = process.env.PROMI_INTERNAL_BETA_OWNER_ID?.trim();
  return configured && configured.length > 0 ? configured : "local-dev-user";
}

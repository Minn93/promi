function parseFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/**
 * Internal beta is the default operating mode until real auth + billing are in place.
 * Set PROMI_INTERNAL_BETA_MODE=0 only when the product is ready for public launch.
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

export function isUnsafePublicLaunchAttemptServer(): boolean {
  return process.env.NODE_ENV === "production" && !isInternalBetaModeServer();
}

export function getInternalBetaOwnerId(): string {
  const configured = process.env.PROMI_INTERNAL_BETA_OWNER_ID?.trim();
  return configured && configured.length > 0 ? configured : "local-dev-user";
}

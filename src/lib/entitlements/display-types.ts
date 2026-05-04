/** Read-only entitlement shape for Upgrade / marketing UI (no DB imports). */

export type OwnerEntitlementDisplay = {
  planTier: string;
  status: string;
  source: string;
  effectiveAtIso: string;
  expiresAtIso: string | null;
};

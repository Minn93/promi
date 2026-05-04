import { prisma } from "@/lib/prisma";
import type { OwnerEntitlementDisplay } from "@/src/lib/entitlements/display-types";
import { normalizePlanTier, type PlanTier } from "@/src/lib/plans/config";

export type { OwnerEntitlementDisplay } from "@/src/lib/entitlements/display-types";

type OwnerEntitlementRow = {
  planTier: string;
  status: string;
  expiresAt: Date | null;
};

const ACTIVE_STATUSES = new Set([
  "active",
  "manual",
  "provider",
  "trial",
  "trialing",
  /** Stripe subscription grace billing — keep Pro privileges until downgrade/cancel webhook. */
  "past_due",
]);

const INACTIVE_STATUSES = new Set([
  "inactive",
  "canceled",
  "cancelled",
  "expired",
]);

function hasExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= Date.now();
}

/**
 * Returns a server-authoritative plan tier from owner_entitlements.
 * Returns null when no entitlement row exists or when the resolver
 * should defer to fallback env behavior.
 */
export async function readOwnerEntitlementPlanTier(ownerId: string): Promise<PlanTier | null> {
  const normalizedOwnerId = ownerId.trim();
  if (!normalizedOwnerId) return null;

  let entitlement: OwnerEntitlementRow | null = null;
  try {
    entitlement = await prisma.ownerEntitlement.findUnique({
      where: { ownerId: normalizedOwnerId },
      select: {
        planTier: true,
        status: true,
        expiresAt: true,
      },
    });
  } catch (error) {
    // Keep resolver fallback-friendly while schema is rolling out.
    console.warn("[entitlements] failed to read owner entitlement; falling back to env plan.", {
      ownerId: normalizedOwnerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (!entitlement) return null;
  if (hasExpired(entitlement.expiresAt)) return "free";

  const status = entitlement.status.trim().toLowerCase();
  if (INACTIVE_STATUSES.has(status)) return "free";
  if (ACTIVE_STATUSES.has(status)) return normalizePlanTier(entitlement.planTier);

  // Unknown statuses are treated conservatively.
  return "free";
}

/** Read-only snapshot for Upgrade UI (does not alter resolver precedence). */
export async function fetchOwnerEntitlementDisplay(
  ownerId: string,
): Promise<OwnerEntitlementDisplay | null> {
  const normalizedOwnerId = ownerId.trim();
  if (!normalizedOwnerId) return null;
  try {
    const row = await prisma.ownerEntitlement.findUnique({
      where: { ownerId: normalizedOwnerId },
      select: {
        planTier: true,
        status: true,
        source: true,
        effectiveAt: true,
        expiresAt: true,
      },
    });
    if (!row) return null;
    return {
      planTier: row.planTier,
      status: row.status,
      source: row.source,
      effectiveAtIso: row.effectiveAt.toISOString(),
      expiresAtIso: row.expiresAt ? row.expiresAt.toISOString() : null,
    };
  } catch {
    return null;
  }
}

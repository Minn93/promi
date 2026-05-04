import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { readOwnerEntitlementPlanTier } from "@/src/lib/entitlements/server";
import { normalizePlanTier, type PlanTier } from "@/src/lib/plans/config";

function getProOwnerSet(): Set<string> {
  const raw = process.env.PROMI_DEV_PRO_OWNER_IDS ?? "";
  const ids = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set(ids);
}

function getFallbackPlanTierForOwner(ownerId: string): PlanTier {
  const defaultTier = normalizePlanTier(process.env.PROMI_DEFAULT_PLAN ?? process.env.NEXT_PUBLIC_PROMI_DEFAULT_PLAN);
  if (defaultTier === "pro") return "pro";
  const proOwners = getProOwnerSet();
  if (proOwners.has(ownerId)) return "pro";
  return "free";
}

export async function getPlanTierForOwner(ownerId: string): Promise<PlanTier> {
  const entitlementTier = await readOwnerEntitlementPlanTier(ownerId);
  if (entitlementTier) return entitlementTier;
  return getFallbackPlanTierForOwner(ownerId);
}

/**
 * Convenience for the authenticated session owner. Routes that already call
 * `getCurrentOwnerId()` should use `getPlanTierForOwner(ownerId)` to avoid a second session read.
 */
export async function getCurrentPlanTier(): Promise<PlanTier> {
  return getPlanTierForOwner(await getCurrentOwnerId());
}

import type { Prisma } from "@prisma/client";

import type { MirrorPlan } from "@/src/lib/billing/stripe-event-handlers";
import { normalizePlanTier } from "@/src/lib/plans/config";

/** Active manual operator rows block provider downgrade/overwrite until expired or revoked. */
const MANUAL_SOURCE = "manual";
const MANUAL_LOCK_STATUSES = new Set(["active", "manual"]);

const PROVIDER_ENTITLEMENT_SOURCE = "provider";
const SYNC_ACTION = "provider_sync";

/** Result of syncing owner_entitlements inside a Stripe webhook transaction. */
export type StripeWebhookEntitlementSyncOutcome = {
  entitlementUpdated?: boolean;
  entitlementSkippedManual?: boolean;
};

type SubscriptionMirror = NonNullable<
  Extract<MirrorPlan, { kind: "apply" }>["subscription"]
>;

function entitlementExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= Date.now();
}

export function hasActiveManualLock(row: {
  source: string;
  status: string;
  expiresAt: Date | null;
}): boolean {
  const src = row.source.trim().toLowerCase();
  if (src !== MANUAL_SOURCE) return false;
  if (entitlementExpired(row.expiresAt)) return false;
  const st = row.status.trim().toLowerCase();
  return MANUAL_LOCK_STATUSES.has(st);
}

/**
 * Map Stripe Billing mirror subscription snapshot → authoritative-style entitlement delta.
 *
 * Conservative: unknown Stripe statuses downgrade to inactive free (`past_due` keeps **pro**
 * with grace — resolver must recognize `past_due` as active).
 *
 * expiry: trial uses `trialEnd ?? periodEnd`, active uses `periodEnd`, past_due uses `periodEnd`.
 */
export function stripeMirrorSubscriptionToDesiredEntitlement(snapshot: SubscriptionMirror): {
  planTier: string;
  status: string;
  expiresAt: Date | null;
} {
  const st = snapshot.status.trim().toLowerCase();
  switch (st) {
    case "active": {
      return {
        planTier: "pro",
        status: "active",
        expiresAt: snapshot.periodEnd ?? null,
      };
    }
    case "trialing": {
      return {
        planTier: "pro",
        status: "trialing",
        expiresAt: snapshot.trialEnd ?? snapshot.periodEnd ?? null,
      };
    }
    case "past_due": {
      return {
        planTier: "pro",
        status: "past_due",
        expiresAt: snapshot.periodEnd ?? null,
      };
    }

    case "canceled":
    case "cancelled":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused": {
      return {
        planTier: "free",
        status: st === "canceled" || st === "cancelled" ? "canceled" : "inactive",
        expiresAt: null,
      };
    }

    default: {
      return {
        planTier: "free",
        status: "inactive",
        expiresAt: null,
      };
    }
  }
}

function datesRoughlyEqual(a: Date | null, b: Date | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a.getTime() - b.getTime()) < 1500;
}

function desiredMatchesExisting(
  existing: {
    planTier: string;
    status: string;
    source: string;
    expiresAt: Date | null;
  },
  desired: ReturnType<typeof stripeMirrorSubscriptionToDesiredEntitlement>,
): boolean {
  return (
    normalizePlanTier(existing.planTier) === normalizePlanTier(desired.planTier)
    && existing.status.trim().toLowerCase() === desired.status.trim().toLowerCase()
    && existing.source.trim().toLowerCase() === PROVIDER_ENTITLEMENT_SOURCE
    && datesRoughlyEqual(existing.expiresAt, desired.expiresAt)
  );
}

/**
 * Applies provider entitlement reconciliation when Stripe mirror rows were written.
 *
 * Preconditions: callers only invoke when ingest + mirror path runs (same DB transaction).
 * Manual grant/revoke (active manual lock): mirror already applied earlier in tx; skips owner_entitlements.
 *
 * Ops revoke (`manual`/`inactive`): **not locked** → provider may later re-activate entitlement on active Stripe webhooks.
 */
export async function maybeSyncStripeProviderEntitlement(
  tx: Prisma.TransactionClient,
  plan: MirrorPlan,
  stripeSummary: { id: string; type: string },
): Promise<StripeWebhookEntitlementSyncOutcome> {
  if (plan.kind !== "apply" || !plan.subscription) {
    return {};
  }

  const ownerId = plan.subscription.ownerId.trim();
  if (!ownerId) return {};

  const existingRow = await tx.ownerEntitlement.findUnique({
    where: { ownerId },
    select: {
      planTier: true,
      status: true,
      source: true,
      expiresAt: true,
    },
  });

  const desired = stripeMirrorSubscriptionToDesiredEntitlement(plan.subscription);

  if (existingRow && hasActiveManualLock(existingRow)) {
    console.info(
      `[billing/provider_sync] entitlement skip owner=${ownerId} stripe_evt=${stripeSummary.id} reason=manual_override`,
    );
    return { entitlementSkippedManual: true };
  }

  if (existingRow && desiredMatchesExisting(existingRow, desired)) {
    return {};
  }

  const prevTier = existingRow?.planTier ?? null;
  const prevStatus = existingRow?.status ?? null;

  await tx.ownerEntitlement.upsert({
    where: { ownerId },
    create: {
      ownerId,
      planTier: desired.planTier,
      status: desired.status,
      source: PROVIDER_ENTITLEMENT_SOURCE,
      effectiveAt: new Date(),
      expiresAt: desired.expiresAt,
    },
    update: {
      planTier: desired.planTier,
      status: desired.status,
      source: PROVIDER_ENTITLEMENT_SOURCE,
      expiresAt: desired.expiresAt,
      effectiveAt: new Date(),
    },
  });

  await tx.entitlementAuditLog.create({
    data: {
      ownerId,
      action: SYNC_ACTION,
      previousPlanTier: prevTier,
      nextPlanTier: desired.planTier,
      previousStatus: prevStatus,
      nextStatus: desired.status,
      source: PROVIDER_ENTITLEMENT_SOURCE,
      notes: `${stripeSummary.type}:${stripeSummary.id}`,
      actorOwnerId: null,
    },
  });

  return { entitlementUpdated: true };
}

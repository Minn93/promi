#!/usr/bin/env node

/**
 * Read-only billing integrity checks (Phase 13.2.7).
 * Prints aggregate counts only — no secrets, no owner/subscription identifiers, no mutation.
 *
 * Env:
 * - DATABASE_URL (required)
 * - PROMI_BILLING_HEALTH_PENDING_MINUTES — treat unprocessed webhook rows older than N minutes as critical (default 30, clamped 5–1440)
 *
 * Exit: 1 if any CRITICAL check is non-zero; 0 otherwise (warnings/info still print).
 */

import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toCount(rows) {
  const v = rows[0]?.count;
  if (typeof v === "bigint") return Number(v);
  return Number.parseInt(String(v ?? 0), 10) || 0;
}

const prisma = createPrismaClient();

async function main() {
  const pendingMinutes = clampInt(process.env.PROMI_BILLING_HEALTH_PENDING_MINUTES, 5, 1440, 30);

  console.log("");
  console.log("Promi billing health (Phase 13.2.7 — read-only counts)");
  console.log(`Stale pending webhook threshold: ${pendingMinutes} minutes (processed_at IS NULL)`);
  console.log("");

  const pendingStale = toCount(
    await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count
       FROM billing_webhook_events
       WHERE processed_at IS NULL
         AND created_at < NOW() - ($1::int * INTERVAL '1 minute')`,
      pendingMinutes,
    ),
  );

  /** Billable Stripe mirror but provider entitlement row does not look like active Pro. */
  const mirrorBillableEntitlementDrift = toCount(
    await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM billing_subscriptions AS bs
      INNER JOIN owner_entitlements AS oe ON oe.owner_id = bs.owner_id
      WHERE bs.provider = 'stripe'
        AND LOWER(TRIM(bs.status)) IN ('active', 'trialing', 'past_due')
        AND LOWER(TRIM(oe.source)) = 'provider'
        AND (
          LOWER(TRIM(oe.plan_tier)) <> 'pro'
          OR LOWER(TRIM(oe.status)) IN ('inactive', 'canceled', 'cancelled', 'expired')
          OR (oe.expires_at IS NOT NULL AND oe.expires_at <= NOW())
        )
    `,
  );

  /** Terminal mirror but entitlement still shows billable provider Pro. */
  const mirrorTerminalEntitlementPro = toCount(
    await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM billing_subscriptions AS bs
      INNER JOIN owner_entitlements AS oe ON oe.owner_id = bs.owner_id
      WHERE bs.provider = 'stripe'
        AND LOWER(TRIM(bs.status)) IN (
          'canceled',
          'cancelled',
          'unpaid',
          'paused',
          'incomplete',
          'incomplete_expired'
        )
        AND LOWER(TRIM(oe.source)) = 'provider'
        AND LOWER(TRIM(oe.plan_tier)) = 'pro'
        AND LOWER(TRIM(oe.status)) IN ('active', 'trialing', 'past_due')
        AND (oe.expires_at IS NULL OR oe.expires_at > NOW())
    `,
  );

  /** Provider Pro (billable) with no matching billable Stripe subscription row. */
  const providerProMissingBillableSub = toCount(
    await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM owner_entitlements AS oe
      WHERE LOWER(TRIM(oe.source)) = 'provider'
        AND LOWER(TRIM(oe.plan_tier)) = 'pro'
        AND LOWER(TRIM(oe.status)) IN ('active', 'trialing', 'past_due')
        AND (oe.expires_at IS NULL OR oe.expires_at > NOW())
        AND NOT EXISTS (
          SELECT 1
          FROM billing_subscriptions AS bs
          WHERE bs.owner_id = oe.owner_id
            AND bs.provider = 'stripe'
            AND LOWER(TRIM(bs.status)) IN ('active', 'trialing', 'past_due')
        )
    `,
  );

  const duplicateBillableSubsOwners = toCount(
    await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT bs.owner_id
        FROM billing_subscriptions AS bs
        WHERE bs.provider = 'stripe'
          AND LOWER(TRIM(bs.status)) IN ('active', 'trialing', 'past_due')
        GROUP BY bs.owner_id
        HAVING COUNT(*) > 1
      ) AS dup
    `,
  );

  const activeManualLocks = toCount(
    await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM owner_entitlements AS oe
      WHERE LOWER(TRIM(oe.source)) = 'manual'
        AND LOWER(TRIM(oe.status)) IN ('active', 'manual')
        AND (oe.expires_at IS NULL OR oe.expires_at > NOW())
        AND LOWER(TRIM(oe.plan_tier)) = 'pro'
    `,
  );

  const lines = [
    { level: "CRITICAL", label: "pending_webhook_events_stale", value: pendingStale },
    { level: "CRITICAL", label: "mirror_billable_but_provider_entitlement_not_pro_active", value: mirrorBillableEntitlementDrift },
    { level: "CRITICAL", label: "mirror_terminal_but_provider_entitlement_still_pro", value: mirrorTerminalEntitlementPro },
    { level: "CRITICAL", label: "provider_pro_entitlement_without_billable_stripe_mirror", value: providerProMissingBillableSub },
    { level: "WARN", label: "owners_with_multiple_billable_stripe_subscriptions", value: duplicateBillableSubsOwners },
    { level: "INFO", label: "active_manual_pro_lock_rows_review", value: activeManualLocks },
  ];

  for (const row of lines) {
    console.log(`[${row.level}] ${row.label}: ${row.value}`);
  }

  console.log("");
  console.log(
    "HTTP 5xx rates, Stripe Dashboard, and logs are monitored outside this script — see docs/PHASE13_2_7_BILLING_SOAK_PLAN.md.",
  );
  console.log("");

  const criticalHits = lines.filter((l) => l.level === "CRITICAL" && l.value > 0);

  if (criticalHits.length > 0) {
    console.log("Result: FAIL (critical checks non-zero)");
    process.exitCode = 1;
  } else {
    console.log("Result: OK (no critical billing integrity drift by these counts)");
    process.exitCode = 0;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

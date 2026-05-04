#!/usr/bin/env node

/**
 * Phase 13.1-D / 13.1-F — Manual OwnerEntitlement grant / revoke / inspect / audit log read.
 * No HTTP API; requires DATABASE_URL (same pattern as backfill/validate scripts).
 * Mutations require --confirm. Does not print secrets.
 */

import path from "node:path";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const VALID_ACTIONS = new Set(["grant", "revoke", "status", "audit"]);
const VALID_PLANS = new Set(["free", "pro"]);

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (const raw of argv) {
    if (raw === "--confirm") {
      out.confirm = true;
      continue;
    }
    if (raw.startsWith("--") && raw.includes("=")) {
      const idx = raw.indexOf("=");
      const key = raw.slice(2, idx);
      const value = raw.slice(idx + 1);
      out[key] = value;
      continue;
    }
    if (raw.startsWith("--")) {
      out[raw.slice(2)] = true;
      continue;
    }
  }
  return out;
}

function parseIsoDate(label, raw) {
  if (raw == null || raw.trim() === "") return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${label} must be a valid ISO datetime. Got: ${raw}`);
  }
  return d;
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

/** @param {Date | null} a @param {Date | null} b */
function datesEqualMillis(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}

/** @param {import("@prisma/client").OwnerEntitlement | null} row */
function summarizeEntitlement(ownerId, row) {
  if (!row) {
    return {
      ownerId,
      planTier: null,
      status: null,
      source: null,
      effectiveAt: null,
      expiresAt: null,
      updatedBy: null,
      notes: null,
      updatedAt: null,
    };
  }
  return {
    ownerId: row.ownerId,
    planTier: row.planTier,
    status: row.status,
    source: row.source,
    effectiveAt: row.effectiveAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    updatedBy: row.updatedBy,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** @param {Record<string, unknown>} obj */
function printSummary(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    process.stdout.write(`${k}: ${v === null ? "null" : String(v)}\n`);
  }
}

async function main() {
  let exitCode = 0;
  const prisma = createPrismaClient();

  try {
    const args = parseArgs(process.argv.slice(2));
    const ownerIdRaw = typeof args.ownerId === "string" ? args.ownerId : "";
    const ownerId = ownerIdRaw.trim();
    if (!ownerId) {
      process.stderr.write(
        "Missing --ownerId.\nExample: npm run entitlement:manage -- --action=status --ownerId=local-dev-user\n",
      );
      exitCode = 1;
      return;
    }

    const action =
      typeof args.action === "string" ? args.action.trim().toLowerCase() : "";
    if (!action || !VALID_ACTIONS.has(action)) {
      process.stderr.write(
        "Missing or invalid --action. Use grant | revoke | status | audit.\n",
      );
      exitCode = 1;
      return;
    }

    const confirmed = Boolean(args.confirm);
    if ((action === "grant" || action === "revoke") && !confirmed) {
      process.stderr.write(
        "Refusing mutation without --confirm. Re-run with --confirm.\n",
      );
      exitCode = 1;
      return;
    }

    if (action === "status") {
      const row = await prisma.ownerEntitlement.findUnique({
        where: { ownerId },
      });
      printSummary({
        ...summarizeEntitlement(ownerId, row),
        resolverNote:
          row == null
            ? "No owner_entitlements row — server falls back to env (PROMI_DEFAULT_PLAN / PROMI_DEV_PRO_OWNER_IDS)."
            : "Owner row exists — server uses owner_entitlements first (unless expired/inactive semantics apply).",
      });
      return;
    }

    if (action === "audit") {
      const limitRaw =
        typeof args.limit === "string" ? Number.parseInt(args.limit, 10) : NaN;
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
      const rows = await prisma.entitlementAuditLog.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      process.stdout.write(
        `ownerId: ${ownerId}\naudit_entries (latest ${limit}, newest first):\n`,
      );
      for (const r of rows) {
        process.stdout.write(
          JSON.stringify({
            createdAt: r.createdAt.toISOString(),
            action: r.action,
            previousPlanTier: r.previousPlanTier,
            nextPlanTier: r.nextPlanTier,
            previousStatus: r.previousStatus,
            nextStatus: r.nextStatus,
            source: r.source,
            notes: r.notes,
          })
            + "\n",
        );
      }
      return;
    }

    const planArg =
      typeof args.plan === "string" ? args.plan.trim().toLowerCase() : "";

    /** @type {"free"|"pro"} */
    let nextPlanTier;
    /** @type {string} */
    let nextStatus;
    /** @type {Date | null} */
    let expiresAt;

    const effectiveAt =
      typeof args.effectiveAt === "string"
        ? parseIsoDate("--effectiveAt", args.effectiveAt)
        : null;
    const updatedBy =
      typeof args.updatedBy === "string" ? args.updatedBy.trim() || null : null;
    const notes =
      typeof args.notes === "string" ? args.notes.trim() || null : null;
    const actorOwnerIdRaw =
      typeof args.actorOwnerId === "string"
        ? args.actorOwnerId.trim()
        : process.env.PROMI_ENTITLEMENT_ACTOR_OWNER_ID?.trim() ?? "";
    const actorOwnerId =
      actorOwnerIdRaw.length > 0 ? actorOwnerIdRaw : null;

    if (action === "grant") {
      if (planArg && !VALID_PLANS.has(planArg)) {
        throw new Error("Invalid --plan. Use free | pro (omit for pro grant).");
      }
      if (planArg === "free") {
        throw new Error(
          "grant sets Pro by convention; use revoke for free/inactive.",
        );
      }
      nextPlanTier = "pro";
      expiresAt =
        typeof args.expiresAt === "string"
          ? parseIsoDate("--expiresAt", args.expiresAt)
          : null;
      nextStatus = "active";
    } else {
      nextPlanTier = "free";
      nextStatus = "inactive";
      expiresAt = null;
      if (planArg || typeof args.expiresAt === "string") {
        throw new Error(
          "revoke does not accept --plan or --expiresAt (sets free/inactive and clears expiry).",
        );
      }
    }

    const nextEffectiveAt = effectiveAt ?? new Date();

    const txnResult = await prisma.$transaction(async (tx) => {
      const prev = await tx.ownerEntitlement.findUnique({
        where: { ownerId },
      });

      const isNoOp =
        !!prev
        && prev.planTier === nextPlanTier
        && prev.status === nextStatus
        && prev.source === "manual"
        && datesEqualMillis(prev.expiresAt, expiresAt);

      if (isNoOp) {
        return /** @type {const} */ ({ noOp: true, row: prev });
      }

      const row =
        prev
          ? await tx.ownerEntitlement.update({
              where: { ownerId },
              data: {
                planTier: nextPlanTier,
                status: nextStatus,
                source: "manual",
                effectiveAt: nextEffectiveAt,
                expiresAt,
                updatedBy,
                notes,
              },
            })
          : await tx.ownerEntitlement.create({
              data: {
                ownerId,
                planTier: nextPlanTier,
                status: nextStatus,
                source: "manual",
                effectiveAt: nextEffectiveAt,
                expiresAt,
                updatedBy,
                notes,
              },
            });

      await tx.entitlementAuditLog.create({
        data: {
          ownerId,
          action,
          previousPlanTier: prev?.planTier ?? null,
          nextPlanTier,
          previousStatus: prev?.status ?? null,
          nextStatus,
          source: "manual",
          actorOwnerId,
          notes: notes ?? `${action} via manage-entitlement.mjs`,
        },
      });

      return /** @type {const} */ ({ noOp: false, row });
    });

    printSummary({
      outcome: txnResult.noOp ? "no_change" : "updated",
      action,
      ...summarizeEntitlement(ownerId, txnResult.row),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }

  process.exit(exitCode);
}

main();

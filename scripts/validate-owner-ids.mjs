#!/usr/bin/env node

import path from "node:path";
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

const prisma = createPrismaClient();

function toCountNumber(value) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  return Number.parseInt(String(value), 10);
}

async function queryCount(query) {
  const rows = await query();
  const firstRow = rows[0];
  if (!firstRow || firstRow.count == null) {
    throw new Error("Unable to read count result");
  }
  return toCountNumber(firstRow.count);
}

async function readCounts() {
  const [
    scheduledTotal,
    scheduledMissing,
    historyTotal,
    historyMissing,
    attemptsTotal,
    attemptsMissing,
    historyOwnerMismatch,
    attemptsOwnerMismatch,
  ] = await Promise.all([
    prisma.scheduledPost.count(),
    queryCount(() => prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM "scheduled_posts"
      WHERE "owner_id" IS NULL OR btrim("owner_id") = ''
    `),
    prisma.postHistory.count(),
    queryCount(() => prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM "post_history"
      WHERE "owner_id" IS NULL OR btrim("owner_id") = ''
    `),
    prisma.publishAttempt.count(),
    queryCount(() => prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM "publish_attempts"
      WHERE "owner_id" IS NULL OR btrim("owner_id") = ''
    `),
    queryCount(() => prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM "post_history" AS ph
      JOIN "scheduled_posts" AS sp ON sp."id" = ph."scheduled_post_id"
      WHERE ph."scheduled_post_id" IS NOT NULL
        AND coalesce(btrim(ph."owner_id"), '') <> coalesce(btrim(sp."owner_id"), '')
    `),
    queryCount(() => prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM "publish_attempts" AS pa
      JOIN "scheduled_posts" AS sp ON sp."id" = pa."scheduled_post_id"
      WHERE pa."scheduled_post_id" IS NOT NULL
        AND coalesce(btrim(pa."owner_id"), '') <> coalesce(btrim(sp."owner_id"), '')
    `),
  ]);

  return {
    scheduled: { total: scheduledTotal, missing: scheduledMissing },
    history: { total: historyTotal, missing: historyMissing, mismatch: historyOwnerMismatch },
    attempts: { total: attemptsTotal, missing: attemptsMissing, mismatch: attemptsOwnerMismatch },
  };
}

function printCountBlock(counts) {
  process.stdout.write("\nOwner ID validation counts\n");
  process.stdout.write(
    `- scheduled_posts: total=${counts.scheduled.total}, missing_owner_id=${counts.scheduled.missing}\n`,
  );
  process.stdout.write(
    `- post_history: total=${counts.history.total}, missing_owner_id=${counts.history.missing}, owner_mismatch_vs_scheduled_post=${counts.history.mismatch}\n`,
  );
  process.stdout.write(
    `- publish_attempts: total=${counts.attempts.total}, missing_owner_id=${counts.attempts.missing}, owner_mismatch_vs_scheduled_post=${counts.attempts.mismatch}\n`,
  );
}

async function main() {
  process.stdout.write("Promi owner_id validation (Phase 12.1-E)\n");

  const counts = await readCounts();
  printCountBlock(counts);

  const blockingIssues =
    counts.scheduled.missing +
    counts.history.missing +
    counts.attempts.missing +
    counts.history.mismatch +
    counts.attempts.mismatch;

  if (blockingIssues > 0) {
    throw new Error(`Validation failed: ${blockingIssues} blocking owner_id issue(s) detected.`);
  }

  process.stdout.write("\nResult: OK (no missing or mismatched owner_id rows)\n");
}

main()
  .catch((error) => {
    process.stderr.write(`\nResult: FAILED\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

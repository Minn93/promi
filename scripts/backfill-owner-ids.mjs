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
const DEFAULT_OWNER_ID = "local-dev-user";

function resolveFallbackOwnerId() {
  const configured = process.env.PROMI_INTERNAL_BETA_OWNER_ID?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_OWNER_ID;
}

function printCountBlock(title, counts) {
  process.stdout.write(`\n${title}\n`);
  process.stdout.write(
    `- scheduled_posts: total=${counts.scheduled.total}, missing_owner_id=${counts.scheduled.missing}\n`,
  );
  process.stdout.write(
    `- post_history: total=${counts.history.total}, missing_owner_id=${counts.history.missing}\n`,
  );
  process.stdout.write(
    `- publish_attempts: total=${counts.attempts.total}, missing_owner_id=${counts.attempts.missing}\n`,
  );
}

async function readCounts() {
  const [scheduledTotal, scheduledMissing, historyTotal, historyMissing, attemptsTotal, attemptsMissing] =
    await Promise.all([
      prisma.scheduledPost.count(),
      prisma.scheduledPost.count({ where: { OR: [{ ownerId: null }, { ownerId: "" }] } }),
      prisma.postHistory.count(),
      prisma.postHistory.count({ where: { OR: [{ ownerId: null }, { ownerId: "" }] } }),
      prisma.publishAttempt.count(),
      prisma.publishAttempt.count({ where: { OR: [{ ownerId: null }, { ownerId: "" }] } }),
    ]);

  return {
    scheduled: { total: scheduledTotal, missing: scheduledMissing },
    history: { total: historyTotal, missing: historyMissing },
    attempts: { total: attemptsTotal, missing: attemptsMissing },
  };
}

async function runBackfill(fallbackOwnerId) {
  const scheduledFallbackUpdated = await prisma.scheduledPost.updateMany({
    where: { OR: [{ ownerId: null }, { ownerId: "" }] },
    data: { ownerId: fallbackOwnerId },
  });

  const historyFromScheduled = await prisma.$executeRaw`
    UPDATE "post_history" AS ph
    SET "owner_id" = sp."owner_id"
    FROM "scheduled_posts" AS sp
    WHERE ph."scheduled_post_id" = sp."id"
      AND (ph."owner_id" IS NULL OR btrim(ph."owner_id") = '')
      AND sp."owner_id" IS NOT NULL
      AND btrim(sp."owner_id") <> ''
  `;

  const historyFallbackUpdated = await prisma.postHistory.updateMany({
    where: { OR: [{ ownerId: null }, { ownerId: "" }] },
    data: { ownerId: fallbackOwnerId },
  });

  const attemptsFromScheduled = await prisma.$executeRaw`
    UPDATE "publish_attempts" AS pa
    SET "owner_id" = sp."owner_id"
    FROM "scheduled_posts" AS sp
    WHERE pa."scheduled_post_id" = sp."id"
      AND (pa."owner_id" IS NULL OR btrim(pa."owner_id") = '')
      AND sp."owner_id" IS NOT NULL
      AND btrim(sp."owner_id") <> ''
  `;

  const attemptsFallbackUpdated = await prisma.publishAttempt.updateMany({
    where: { OR: [{ ownerId: null }, { ownerId: "" }] },
    data: { ownerId: fallbackOwnerId },
  });

  process.stdout.write("\nBackfill updates applied\n");
  process.stdout.write(`- scheduled_posts fallback updates: ${scheduledFallbackUpdated.count}\n`);
  process.stdout.write(`- post_history copied from scheduled_posts: ${historyFromScheduled}\n`);
  process.stdout.write(`- post_history fallback updates: ${historyFallbackUpdated.count}\n`);
  process.stdout.write(`- publish_attempts copied from scheduled_posts: ${attemptsFromScheduled}\n`);
  process.stdout.write(`- publish_attempts fallback updates: ${attemptsFallbackUpdated.count}\n`);
}

async function main() {
  const fallbackOwnerId = resolveFallbackOwnerId();

  process.stdout.write("Promi owner_id backfill (Phase 12.1-B)\n");
  process.stdout.write(
    `Fallback owner source: ${
      process.env.PROMI_INTERNAL_BETA_OWNER_ID?.trim() ? "PROMI_INTERNAL_BETA_OWNER_ID" : DEFAULT_OWNER_ID
    }\n`,
  );

  const preCounts = await readCounts();
  printCountBlock("Preflight counts", preCounts);

  await runBackfill(fallbackOwnerId);

  const postCounts = await readCounts();
  printCountBlock("Post-backfill counts", postCounts);

  const remainingMissing = postCounts.scheduled.missing + postCounts.history.missing + postCounts.attempts.missing;
  if (remainingMissing > 0) {
    throw new Error(`Backfill incomplete: ${remainingMissing} rows still missing owner_id.`);
  }

  process.stdout.write("\nResult: OK (no missing owner_id rows)\n");
}

main()
  .catch((error) => {
    process.stderr.write(`\nResult: FAILED\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

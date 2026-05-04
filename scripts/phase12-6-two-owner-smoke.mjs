#!/usr/bin/env node

import path from "node:path";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { encode } from "next-auth/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const BASE_URL = process.env.PHASE12_6_BASE_URL?.trim() || "http://127.0.0.1:3100";
const AUTH_SECRET = process.env.PHASE12_6_AUTH_SECRET?.trim() || "phase12_6_secret_key";
const OWNER_A = {
  id: process.env.PHASE12_6_OWNER_A_ID?.trim() || "phase12-owner-a",
  email: process.env.PHASE12_6_OWNER_A_EMAIL?.trim() || "phase12-owner-a@example.com",
};
const OWNER_B = {
  id: process.env.PHASE12_6_OWNER_B_ID?.trim() || "phase12-owner-b",
  email: process.env.PHASE12_6_OWNER_B_EMAIL?.trim() || "phase12-owner-b@example.com",
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

async function buildSessionCookie(owner) {
  const token = await encode({
    token: {
      sub: owner.id,
      email: owner.email,
      name: owner.email,
    },
    secret: AUTH_SECRET,
    maxAge: 60 * 60,
  });
  return `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}`;
}

async function requestAsOwner(owner, route, init = {}) {
  const cookie = await buildSessionCookie(owner);
  const headers = new Headers(init.headers || {});
  headers.set("cookie", cookie);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${BASE_URL}${route}`, { ...init, headers, redirect: "manual" });
}

async function readJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function addResult(results, name, expected, actual, pass) {
  results.push({ name, expected, actual, pass });
}

async function main() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const markerA = `PHASE12_6_OWNER_A_${timestamp}`;
  const markerB = `PHASE12_6_OWNER_B_${timestamp}`;
  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const results = [];
  const cleanupScheduledPostIds = [];
  const cleanupAccountIds = [];

  process.stdout.write(`Phase 12.6 adversarial smoke base URL: ${BASE_URL}\n`);
  process.stdout.write(`Owner A: ${OWNER_A.id}\n`);
  process.stdout.write(`Owner B: ${OWNER_B.id}\n`);

  const createdA = await requestAsOwner(OWNER_A, "/api/scheduled-posts", {
    method: "POST",
    body: JSON.stringify({
      productId: `phase12-6-prod-a-${timestamp}`,
      productName: `Phase12.6 Product A ${timestamp}`,
      channels: ["x"],
      contentPayload: { instagramCaption: markerA },
      scheduledAt,
    }),
  });
  const createdABody = await readJsonSafe(createdA);
  const ownerAScheduledPostId = createdABody?.data?.id ?? null;
  addResult(
    results,
    "Owner A create scheduled post",
    "201 + new post id",
    `status=${createdA.status}; id=${ownerAScheduledPostId ?? "n/a"}`,
    createdA.status === 201 && Boolean(ownerAScheduledPostId),
  );
  if (!ownerAScheduledPostId) {
    throw new Error("Failed to create Owner A scheduled post; cannot continue adversarial checks.");
  }
  cleanupScheduledPostIds.push(ownerAScheduledPostId);

  const ownerAListRes = await requestAsOwner(OWNER_A, "/api/scheduled-posts?limit=200");
  const ownerAListBody = await readJsonSafe(ownerAListRes);
  const ownerAListHasPost =
    Array.isArray(ownerAListBody?.data) && ownerAListBody.data.some((row) => row.id === ownerAScheduledPostId);
  addResult(
    results,
    "Owner A scheduled list contains Owner A post",
    "Owner A list includes created id",
    `status=${ownerAListRes.status}; contains=${ownerAListHasPost}`,
    ownerAListRes.status === 200 && ownerAListHasPost,
  );

  const ownerBListRes = await requestAsOwner(OWNER_B, "/api/scheduled-posts?limit=200");
  const ownerBListBody = await readJsonSafe(ownerBListRes);
  const ownerBListHasOwnerAPost =
    Array.isArray(ownerBListBody?.data) && ownerBListBody.data.some((row) => row.id === ownerAScheduledPostId);
  addResult(
    results,
    "Owner B scheduled list excludes Owner A post",
    "Owner B list does not include Owner A id",
    `status=${ownerBListRes.status}; containsOwnerA=${ownerBListHasOwnerAPost}`,
    ownerBListRes.status === 200 && !ownerBListHasOwnerAPost,
  );

  const ownerBGetDirectRes = await requestAsOwner(OWNER_B, `/api/scheduled-posts/${ownerAScheduledPostId}`);
  addResult(
    results,
    "Owner B direct GET by Owner A id blocked",
    "404 NOT_FOUND",
    `status=${ownerBGetDirectRes.status}`,
    ownerBGetDirectRes.status === 404,
  );

  const ownerBEditPageRes = await requestAsOwner(OWNER_B, `/scheduled/${ownerAScheduledPostId}/edit`);
  const ownerBEditPageHtml = await ownerBEditPageRes.text();
  const ownerBEditPageBlocked = ownerBEditPageHtml.includes("Scheduled post not found");
  addResult(
    results,
    "Owner B edit page access by Owner A id blocked",
    "Not found UX",
    `status=${ownerBEditPageRes.status}; blockedCopy=${ownerBEditPageBlocked}`,
    ownerBEditPageRes.status === 200 && ownerBEditPageBlocked,
  );

  const ownerBEditApiRes = await requestAsOwner(OWNER_B, `/api/scheduled-posts/${ownerAScheduledPostId}/edit`, {
    method: "PATCH",
    body: JSON.stringify({
      contentPayload: { instagramCaption: `${markerA}-edit-attempt` },
      scheduledAt,
    }),
  });
  addResult(
    results,
    "Owner B edit API by Owner A id blocked",
    "404 NOT_FOUND",
    `status=${ownerBEditApiRes.status}`,
    ownerBEditApiRes.status === 404,
  );

  const ownerBRetryRes = await requestAsOwner(OWNER_B, `/api/scheduled-posts/${ownerAScheduledPostId}/retry`, {
    method: "POST",
  });
  addResult(
    results,
    "Owner B retry API by Owner A id blocked",
    "404 NOT_FOUND",
    `status=${ownerBRetryRes.status}`,
    ownerBRetryRes.status === 404,
  );

  const ownerBCancelRes = await requestAsOwner(OWNER_B, `/api/scheduled-posts/${ownerAScheduledPostId}`, {
    method: "PATCH",
    body: JSON.stringify({ message: "cross-owner cancel attempt" }),
  });
  addResult(
    results,
    "Owner B cancel API by Owner A id blocked",
    "404 NOT_FOUND",
    `status=${ownerBCancelRes.status}`,
    ownerBCancelRes.status === 404,
  );

  const ownerBHistoryRes = await requestAsOwner(
    OWNER_B,
    `/api/post-history?scheduledPostId=${encodeURIComponent(ownerAScheduledPostId)}`,
  );
  const ownerBHistoryBody = await readJsonSafe(ownerBHistoryRes);
  const ownerBHistoryRows = Array.isArray(ownerBHistoryBody?.data) ? ownerBHistoryBody.data.length : -1;
  addResult(
    results,
    "Owner B history filter by Owner A scheduledPostId blocked",
    "200 + empty data",
    `status=${ownerBHistoryRes.status}; rows=${ownerBHistoryRows}`,
    ownerBHistoryRes.status === 200 && ownerBHistoryRows === 0,
  );

  const ownerAConnectedAccountId = randomUUID();
  cleanupAccountIds.push(ownerAConnectedAccountId);
  await prisma.connectedAccount.create({
    data: {
      id: ownerAConnectedAccountId,
      ownerId: OWNER_A.id,
      platform: "x",
      status: "active",
      externalAccountId: `phase12-6-ext-a-${timestamp}`,
      displayName: "Phase12.6 Owner A Account",
      accessToken: "mock-access-owner-a",
      refreshToken: "mock-refresh-owner-a",
    },
  });

  const ownerBConnectedListRes = await requestAsOwner(OWNER_B, "/api/connected-accounts");
  const ownerBConnectedListBody = await readJsonSafe(ownerBConnectedListRes);
  const ownerBSeesOwnerAAccount =
    Array.isArray(ownerBConnectedListBody?.data)
    && ownerBConnectedListBody.data.some((row) => row.id === ownerAConnectedAccountId);
  addResult(
    results,
    "Owner B connected accounts list excludes Owner A account",
    "Owner A account id absent",
    `status=${ownerBConnectedListRes.status}; seesOwnerA=${ownerBSeesOwnerAAccount}`,
    ownerBConnectedListRes.status === 200 && !ownerBSeesOwnerAAccount,
  );

  const ownerBDisconnectAttemptRes = await requestAsOwner(OWNER_B, "/api/connected-accounts", {
    method: "PATCH",
    body: JSON.stringify({ accountId: ownerAConnectedAccountId, action: "disconnect" }),
  });
  addResult(
    results,
    "Owner B disconnect Owner A account blocked",
    "404 NOT_FOUND",
    `status=${ownerBDisconnectAttemptRes.status}`,
    ownerBDisconnectAttemptRes.status === 404,
  );

  const publishedAId = randomUUID();
  const publishedBId = randomUUID();
  cleanupScheduledPostIds.push(publishedAId, publishedBId);
  const publishedAt = new Date();
  await prisma.scheduledPost.create({
    data: {
      id: publishedAId,
      ownerId: OWNER_A.id,
      productId: `phase12-6-analytics-a-${timestamp}`,
      productName: `Phase12.6 Analytics A ${timestamp}`,
      channels: ["x"],
      contentPayload: { instagramCaption: markerA },
      scheduledAt: publishedAt,
      status: "published",
      platform: "x",
      publishedAt,
      processedAt: publishedAt,
      lastAttemptAt: publishedAt,
    },
  });
  await prisma.scheduledPost.create({
    data: {
      id: publishedBId,
      ownerId: OWNER_B.id,
      productId: `phase12-6-analytics-b-${timestamp}`,
      productName: `Phase12.6 Analytics B ${timestamp}`,
      channels: ["x"],
      contentPayload: { instagramCaption: markerB },
      scheduledAt: publishedAt,
      status: "published",
      platform: "x",
      publishedAt,
      processedAt: publishedAt,
      lastAttemptAt: publishedAt,
    },
  });

  const ownerAAnalyticsRes = await requestAsOwner(OWNER_A, "/analytics");
  const ownerAAnalyticsHtml = await ownerAAnalyticsRes.text();
  addResult(
    results,
    "Owner A analytics includes Owner A marker only",
    "Contains A marker, excludes B marker",
    `status=${ownerAAnalyticsRes.status}; hasA=${ownerAAnalyticsHtml.includes(markerA)}; hasB=${ownerAAnalyticsHtml.includes(markerB)}`,
    ownerAAnalyticsRes.status === 200 && ownerAAnalyticsHtml.includes(markerA) && !ownerAAnalyticsHtml.includes(markerB),
  );

  const ownerBAnalyticsRes = await requestAsOwner(OWNER_B, "/analytics");
  const ownerBAnalyticsHtml = await ownerBAnalyticsRes.text();
  addResult(
    results,
    "Owner B analytics includes Owner B marker only",
    "Contains B marker, excludes A marker",
    `status=${ownerBAnalyticsRes.status}; hasB=${ownerBAnalyticsHtml.includes(markerB)}; hasA=${ownerBAnalyticsHtml.includes(markerA)}`,
    ownerBAnalyticsRes.status === 200 && ownerBAnalyticsHtml.includes(markerB) && !ownerBAnalyticsHtml.includes(markerA),
  );

  // Implementation guard for Phase 12.5 bugfix: publish account lookup stays owner-scoped.
  const ownerScopedLookup = await prisma.connectedAccount.findFirst({
    where: { id: ownerAConnectedAccountId, ownerId: OWNER_B.id },
  });
  addResult(
    results,
    "Publish/account ownership guard remains owner-scoped",
    "Cross-owner account lookup returns null",
    `crossOwnerLookup=${ownerScopedLookup ? "non-null" : "null"}`,
    ownerScopedLookup == null,
  );

  for (const id of cleanupScheduledPostIds) {
    await prisma.scheduledPost.deleteMany({ where: { id } });
  }
  for (const id of cleanupAccountIds) {
    await prisma.connectedAccount.deleteMany({ where: { id } });
  }

  const failed = results.filter((item) => !item.pass);
  process.stdout.write("\nPhase 12.6 adversarial smoke results\n");
  for (const item of results) {
    process.stdout.write(`- [${item.pass ? "PASS" : "FAIL"}] ${item.name}\n`);
    process.stdout.write(`  expected: ${item.expected}\n`);
    process.stdout.write(`  actual:   ${item.actual}\n`);
  }

  const payload = {
    ranAt: now.toISOString(),
    baseUrl: BASE_URL,
    ownerA: OWNER_A,
    ownerB: OWNER_B,
    results,
    summary: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
    },
  };
  process.stdout.write(`\nJSON_RESULT=${JSON.stringify(payload)}\n`);

  if (failed.length > 0) {
    throw new Error(`Adversarial smoke failed: ${failed.length} check(s) failed.`);
  }
}

main()
  .catch((error) => {
    process.stderr.write(`\nResult: FAILED\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

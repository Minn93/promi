import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PublishErrorCode } from "@/src/lib/platforms/core/errors";
import type { Platform } from "@/src/lib/platforms/core/types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function getScheduledPostForPublish(id: string) {
  return prisma.scheduledPost.findUnique({ where: { id } });
}

export async function findConnectedAccountForPost(client: DbClient, accountId: string | null, platform: Platform) {
  if (accountId) {
    return client.connectedAccount.findUnique({ where: { id: accountId } });
  }
  return client.connectedAccount.findFirst({
    where: { platform, status: "active" },
    orderBy: { updatedAt: "desc" },
  });
}

export async function persistPublishSuccess(
  client: DbClient,
  args: {
    scheduledPostId: string;
    accountId: string | null;
    platform: Platform;
    providerPostId: string;
    providerUrl?: string;
    rawResponse?: unknown;
    message: string;
    processedAt: Date;
  },
) {
  await client.scheduledPost.updateMany({
    where: { id: args.scheduledPostId, status: "processing" },
    data: {
      status: "published",
      providerPostId: args.providerPostId,
      providerUrl: args.providerUrl ?? null,
      errorCode: null,
      lastError: null,
      errorMessage: null,
      publishedAt: args.processedAt,
      processedAt: args.processedAt,
      lastAttemptAt: args.processedAt,
      processingStartedAt: null,
    },
  });

  await client.publishAttempt.create({
    data: {
      scheduledPostId: args.scheduledPostId,
      accountId: args.accountId,
      platform: args.platform,
      status: "success",
      providerPostId: args.providerPostId,
      providerUrl: args.providerUrl ?? null,
      rawResponse: (args.rawResponse as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });

  await client.postHistory.create({
    data: {
      scheduledPostId: args.scheduledPostId,
      eventType: "published",
      message: args.message,
    },
  });
}

export async function persistPublishFailure(
  client: DbClient,
  args: {
    scheduledPostId: string;
    accountId: string | null;
    platform: Platform;
    code: PublishErrorCode;
    message: string;
    failedAt: Date;
    needsReconnect: boolean;
  },
) {
  await client.scheduledPost.updateMany({
    where: { id: args.scheduledPostId, status: "processing" },
    data: {
      status: args.needsReconnect ? "needs_reconnect" : "failed",
      errorCode: args.code,
      lastError: args.message,
      errorMessage: args.message,
      processedAt: args.failedAt,
      lastAttemptAt: args.failedAt,
      processingStartedAt: null,
    },
  });

  await client.publishAttempt.create({
    data: {
      scheduledPostId: args.scheduledPostId,
      accountId: args.accountId,
      platform: args.platform,
      status: "failed",
      errorCode: args.code,
      errorMessage: args.message,
    },
  });

  await client.postHistory.create({
    data: {
      scheduledPostId: args.scheduledPostId,
      eventType: "failed",
      message: args.message,
    },
  });
}

export function asPlatform(value: string): Platform {
  if (value === "x" || value === "instagram" || value === "facebook") return value;
  return "instagram";
}

export function payloadToText(payload: Prisma.JsonValue): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const data = payload as Record<string, unknown>;
  return [
    String(data.instagramCaption ?? "").trim(),
    String(data.pinterestTitle ?? "").trim(),
    String(data.pinterestDescription ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

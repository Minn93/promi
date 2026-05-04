import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { getInternalBetaOwnerId } from "@/src/lib/internal-beta-mode";
import { PUBLISH_ERROR_CODES } from "@/src/lib/platforms/core/errors";
import { publishPost } from "@/src/lib/services/posts/publish-post";

export const runtime = "nodejs";
const PROCESSING_STALE_MS = 15 * 60 * 1000;

function unauthorized() {
  return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized." });
}

function isAuthorized(request: Request): boolean {
  // Local only: set ALLOW_UNAUTH_SCHEDULER_DEV=1 in .env.local (never in production).
  const allowDevBypass =
    process.env.NODE_ENV !== "production" && process.env.ALLOW_UNAUTH_SCHEDULER_DEV === "1";
  if (allowDevBypass) return true;

  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function isManualSchedulerRun(request: Request): boolean {
  const url = new URL(request.url);
  if (url.searchParams.get("manual") === "1") return true;
  if (request.headers.get("x-promi-manual-scheduler") === "1") return true;
  return false;
}

function resolveScheduledPostOwnerId(ownerId: string | null | undefined, scheduledPostId: string): string {
  const normalized = ownerId?.trim();
  if (normalized) return normalized;
  const fallbackOwnerId = getInternalBetaOwnerId();
  console.warn("[scheduler-owner] owner_id fallback used", { scheduledPostId });
  return fallbackOwnerId;
}

async function handleProcessDueScheduledPosts(request: Request) {
  const disableAutoInDev =
    process.env.NODE_ENV !== "production" && process.env.DISABLE_AUTO_SCHEDULER_DEV === "1";
  if (disableAutoInDev && !isManualSchedulerRun(request)) {
    return NextResponse.json(
      {
        data: { checked: 0, claimed: 0, published: 0, failed: 0, skipped: 0 },
        blocked: true,
        reason: "AUTO_SCHEDULER_DISABLED_IN_DEV",
      },
      { status: 202 },
    );
  }

  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  if (!Number.isFinite(limitRaw) || limitRaw <= 0) {
    return apiError({ status: 400, code: "INVALID_LIMIT", message: "limit must be a positive number." });
  }
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_STALE_MS);

  const result = {
    checked: 0,
    claimed: 0,
    published: 0,
    failed: 0,
    skipped: 0,
    recoveredStale: 0,
  };

  try {
    const staleRows = await prisma.scheduledPost.findMany({
      where: {
        status: "processing",
        OR: [
          { processingStartedAt: { lte: staleBefore } },
          {
            processingStartedAt: null,
            updatedAt: { lte: staleBefore },
          },
        ],
      },
      select: {
        id: true,
        ownerId: true,
        processingStartedAt: true,
      },
      take: limit,
    });

    for (const row of staleRows) {
      const staleMessage = `Processing timed out after ${Math.floor(PROCESSING_STALE_MS / 60000)} minutes. Marked as failed so you can retry.`;
      const failedAt = new Date();
      const recovered = await prisma.scheduledPost.updateMany({
        where: {
          id: row.id,
          status: "processing",
          processingStartedAt: row.processingStartedAt,
        },
        data: {
          status: "failed",
          errorCode: PUBLISH_ERROR_CODES.UNKNOWN,
          lastError: staleMessage,
          errorMessage: staleMessage,
          processedAt: failedAt,
          lastAttemptAt: failedAt,
          processingStartedAt: null,
        },
      });
      if (recovered.count !== 1) continue;
      result.recoveredStale += 1;
      await prisma.postHistory.create({
        data: {
          ownerId: resolveScheduledPostOwnerId(row.ownerId, row.id),
          scheduledPostId: row.id,
          eventType: "failed",
          message: staleMessage,
        },
      });
    }

    const dueRows = await prisma.scheduledPost.findMany({
      where: {
        status: "scheduled",
        scheduledAt: { lte: now },
      },
      select: {
        id: true,
        ownerId: true,
      },
      orderBy: { scheduledAt: "asc" },
      take: limit,
    });

    result.checked = dueRows.length;

    for (const row of dueRows) {
      const claim = await prisma.scheduledPost.updateMany({
        where: {
          id: row.id,
          status: "scheduled",
          scheduledAt: { lte: now },
        },
        data: {
          status: "processing",
          processingStartedAt: now,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
          lastError: null,
          errorMessage: null,
          errorCode: null,
        },
      });

      if (claim.count !== 1) {
        result.skipped += 1;
        continue;
      }

      result.claimed += 1;

      try {
        const publishResult = await publishPost(row.id);
        if (publishResult.status === "published") {
          result.published += 1;
        } else {
          result.failed += 1;
          console.error("[scheduler] publish returned non-success:", { id: row.id, status: publishResult.status, message: publishResult.message });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failedAt = new Date();
        await prisma.$transaction([
          prisma.scheduledPost.updateMany({
            where: { id: row.id, status: "processing" },
            data: {
              status: "failed",
              errorCode: PUBLISH_ERROR_CODES.UNKNOWN,
              lastError: message,
              errorMessage: message,
              processedAt: failedAt,
              lastAttemptAt: failedAt,
              processingStartedAt: null,
            },
          }),
          prisma.postHistory.create({
            data: {
              ownerId: resolveScheduledPostOwnerId(row.ownerId, row.id),
              scheduledPostId: row.id,
              eventType: "failed",
              message,
            },
          }),
        ]);
        console.error("[scheduler] processing -> failed:", { id: row.id, error: message });
        result.failed += 1;
      }
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return apiError({
      status: 500,
      code: "PROCESSOR_FAILED",
      message: "Failed to process due scheduled posts.",
      details: message,
    });
  }
}

export async function POST(request: Request) {
  return handleProcessDueScheduledPosts(request);
}

export async function GET(request: Request) {
  return handleProcessDueScheduledPosts(request);
}

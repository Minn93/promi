import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { publishScheduledPostCore } from "@/lib/scheduled-post-publisher";

export const runtime = "nodejs";

function unauthorized() {
  return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized." });
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function handleProcessDueScheduledPosts(request: Request) {
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

  const result = {
    checked: 0,
    claimed: 0,
    published: 0,
    failed: 0,
    skipped: 0,
  };

  try {
    const dueRows = await prisma.scheduledPost.findMany({
      where: {
        status: "scheduled",
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: "asc" },
      take: limit,
    });

    result.checked = dueRows.length;
    console.info("[scheduler] due rows checked:", { checked: result.checked, limit, now: now.toISOString() });

    for (const row of dueRows) {
      console.info("[scheduler] attempting claim:", { id: row.id, status: row.status, scheduledAt: row.scheduledAt.toISOString() });
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
        },
      });

      if (claim.count !== 1) {
        console.info("[scheduler] skipped claim (already claimed/changed):", { id: row.id });
        result.skipped += 1;
        continue;
      }

      console.info("[scheduler] claimed -> processing:", { id: row.id });
      result.claimed += 1;

      try {
        const processingRow = await prisma.scheduledPost.findUnique({ where: { id: row.id } });
        if (!processingRow) {
          result.failed += 1;
          continue;
        }

        const publish = await publishScheduledPostCore(processingRow);
        const publishedAt = new Date();
        await prisma.$transaction([
          prisma.scheduledPost.updateMany({
            where: { id: row.id, status: "processing" },
            data: {
              status: "published",
              publishedAt,
              processedAt: publishedAt,
              lastError: null,
              errorMessage: null,
              processingStartedAt: null,
            },
          }),
          prisma.postHistory.create({
            data: {
              scheduledPostId: row.id,
              eventType: "published",
              message: publish.message,
            },
          }),
        ]);
        console.info("[scheduler] processing -> published:", { id: row.id, publishedAt: publishedAt.toISOString() });
        result.published += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failedAt = new Date();
        await prisma.$transaction([
          prisma.scheduledPost.updateMany({
            where: { id: row.id, status: "processing" },
            data: {
              status: "failed",
              lastError: message,
              errorMessage: message,
              processedAt: failedAt,
              lastAttemptAt: failedAt,
              processingStartedAt: null,
            },
          }),
          prisma.postHistory.create({
            data: {
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

    console.info("[scheduler] run complete:", result);
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

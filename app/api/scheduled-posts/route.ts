import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api-errors";
import type { InternalPostStatus } from "@/lib/post-status";
import { prisma } from "@/lib/prisma";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { getPlanConfig, isLimitReached } from "@/src/lib/plans/config";
import { getCurrentPlanTier } from "@/src/lib/plans/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type ScheduledPostStatus = Extract<
  InternalPostStatus,
  "scheduled" | "processing" | "published" | "failed" | "needs_reconnect" | "cancelled"
>;
const VALID_STATUSES = new Set<ScheduledPostStatus>([
  "scheduled",
  "processing",
  "published",
  "failed",
  "needs_reconnect",
  "cancelled",
]);

type CreateScheduledPostBody = {
  productId: string;
  productName: string;
  imageUrl?: string | null;
  channels: string[];
  contentPayload: Record<string, unknown>;
  scheduledAt: string;
  idempotencyKey?: string;
  platform?: "x" | "instagram" | "facebook";
  accountId?: string | null;
};

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCreateBody(raw: unknown): CreateScheduledPostBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const productId = asNonEmptyString(o.productId);
  const productName = asNonEmptyString(o.productName);
  const scheduledAt = asNonEmptyString(o.scheduledAt);
  if (!productId || !productName || !scheduledAt) return null;
  if (!Array.isArray(o.channels) || o.channels.length === 0) return null;
  const channels = o.channels
    .map((ch) => asNonEmptyString(ch))
    .filter((ch): ch is string => Boolean(ch));
  if (channels.length === 0) return null;
  if (!o.contentPayload || typeof o.contentPayload !== "object" || Array.isArray(o.contentPayload)) {
    return null;
  }

  const imageUrl = o.imageUrl == null ? null : asNonEmptyString(o.imageUrl);
  const idempotencyKey = o.idempotencyKey == null ? undefined : asNonEmptyString(o.idempotencyKey) ?? undefined;
  const platformRaw = asNonEmptyString(o.platform);
  const platform = platformRaw === "x" || platformRaw === "instagram" || platformRaw === "facebook" ? platformRaw : undefined;
  const accountId = o.accountId == null ? null : asNonEmptyString(o.accountId);

  return {
    productId,
    productName,
    imageUrl,
    channels,
    contentPayload: o.contentPayload as Record<string, unknown>,
    scheduledAt,
    idempotencyKey,
    platform,
    accountId,
  };
}

function parseDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolvePlatform(body: CreateScheduledPostBody): "x" | "instagram" | "facebook" {
  if (body.platform === "x" || body.platform === "instagram" || body.platform === "facebook") {
    return body.platform;
  }
  if (body.channels.includes("x")) return "x";
  if (body.channels.includes("facebook")) return "facebook";
  return "instagram";
}

function hasNonEmptyContent(payload: Record<string, unknown>): boolean {
  return Object.values(payload).some((value) => {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value != null;
  });
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof AggregateError && Array.isArray(err.errors) && err.errors.length > 0) {
    const first = err.errors[0];
    if (first instanceof Error && first.message.trim()) return first.message;
    return String(first);
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return String(err) || "Failed to create scheduled post.";
}

export async function POST(request: Request) {
  let bodyRaw: unknown;
  try {
    bodyRaw = await request.json();
  } catch {
    return apiError({ status: 400, code: "INVALID_JSON", message: "Invalid JSON body." });
  }

  if (!bodyRaw || typeof bodyRaw !== "object" || Object.keys(bodyRaw as Record<string, unknown>).length === 0) {
    return apiError({ status: 400, code: "EMPTY_BODY", message: "Request body must not be empty." });
  }

  const body = parseCreateBody(bodyRaw);
  if (!body) {
    return apiError({
      status: 400,
      code: "INVALID_INPUT",
      message:
        "Invalid request. Required: productId, productName, channels (non-empty array), contentPayload (object), scheduledAt (ISO datetime).",
    });
  }
  if (!hasNonEmptyContent(body.contentPayload)) {
    return apiError({
      status: 400,
      code: "EMPTY_CONTENT",
      message: "Content payload must include at least one non-empty field.",
    });
  }

  const scheduledAt = parseDate(body.scheduledAt);
  if (!scheduledAt) {
    return apiError({
      status: 400,
      code: "INVALID_SCHEDULED_AT",
      message: "scheduledAt must be a valid ISO datetime.",
    });
  }
  if (scheduledAt.getTime() <= Date.now()) {
    return apiError({
      status: 400,
      code: "SCHEDULED_TIME_IN_PAST",
      message: "scheduledAt must be in the future.",
    });
  }

  const ownerId = await getCurrentOwnerId();
  const planTier = await getCurrentPlanTier();
  const plan = getPlanConfig(planTier);
  const activeScheduledCount = await prisma.scheduledPost.count({
    where: {
      ownerId,
      status: { in: ["scheduled", "processing", "failed", "needs_reconnect"] },
    },
  });
  if (isLimitReached(activeScheduledCount, plan.limits.scheduledPostsActive)) {
    return apiError({
      status: 403,
      code: "PLAN_LIMIT_SCHEDULED_POSTS",
      message:
        `You have reached your ${plan.label} limit of ${plan.limits.scheduledPostsActive} active scheduled posts. Upgrade to Pro to schedule more.`,
      details: `owner=${ownerId}; plan=${planTier}; activeScheduled=${activeScheduledCount}`,
    });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const platform = resolvePlatform(body);
      if (body.accountId) {
        const account = await tx.connectedAccount.findFirst({
          where: {
            id: body.accountId,
            ownerId,
            platform,
            status: "active",
          },
        });
        if (!account) {
          throw new Error("Selected account is not available for this platform.");
        }
      }

      const row = await tx.scheduledPost
        .create({
          data: {
            ownerId,
            productId: body.productId,
            productName: body.productName,
            imageUrl: body.imageUrl,
            channels: body.channels as Prisma.InputJsonValue,
            contentPayload: body.contentPayload as Prisma.InputJsonValue,
            scheduledAt,
            platform,
            accountId: body.accountId ?? null,
            idempotencyKey: body.idempotencyKey,
          },
        })
        .catch((error) => {
          console.error("[api/scheduled-posts][POST] scheduledPost.create failed:", error);
          throw new Error(
            `scheduledPost.create failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });

      await tx.postHistory
        .create({
          data: {
            ownerId,
            scheduledPostId: row.id,
            eventType: "scheduled",
            message: "Scheduled post created.",
          },
        })
        .catch((error) => {
          console.error("[api/scheduled-posts][POST] postHistory.create failed:", error);
          throw new Error(
            `postHistory.create failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });

      return row;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error("[api/scheduled-posts][POST] final error:", err);
    const message = extractErrorMessage(err);
    return apiError({ status: 500, code: "CREATE_FAILED", message });
  }
}

export async function GET(request: Request) {
  const ownerId = await getCurrentOwnerId();
  const { searchParams } = new URL(request.url);
  const summary = asNonEmptyString(searchParams.get("summary"));
  const statusRaw = asNonEmptyString(searchParams.get("status"));
  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  if (summary === "active_count") {
    try {
      const activeCount = await prisma.scheduledPost.count({
        where: {
          ownerId,
          status: { in: ["scheduled", "processing", "failed", "needs_reconnect"] },
        },
      });
      return NextResponse.json(
        { data: { activeScheduledPosts: activeCount } },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return apiError({ status: 500, code: "COUNT_FAILED", message: "Failed to count active scheduled posts.", details: message });
    }
  }

  if (statusRaw && !VALID_STATUSES.has(statusRaw as ScheduledPostStatus)) {
    return apiError({
      status: 400,
      code: "INVALID_STATUS",
      message: "Invalid status filter. Use scheduled, processing, published, failed, needs_reconnect, or cancelled.",
    });
  }
  const status = (statusRaw ?? undefined) as ScheduledPostStatus | undefined;

  try {
    const rows = await prisma.scheduledPost.findMany({
      where: status ? { ownerId, status } : { ownerId },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: limit,
    });

    return NextResponse.json({ data: rows }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return apiError({ status: 500, code: "LIST_FAILED", message: "Failed to list scheduled posts.", details: message });
  }
}

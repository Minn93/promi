import { NextResponse } from "next/server";
import { activeScheduledPostsWhere, planScheduledRetry } from "@/lib/active-scheduled-posts";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { accountGateApiError, checkOwnerAccountGates } from "@/src/lib/auth/user-status";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { getPlanConfig } from "@/src/lib/plans/config";
import { getPlanTierForOwner } from "@/src/lib/plans/server";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(_: Request, { params }: Params) {
  const ownerId = await getCurrentOwnerId();
  const policyGate = await checkOwnerAccountGates(ownerId, { requireVerifiedEmail: true });
  if (policyGate) return accountGateApiError(policyGate);
  const { id } = await params;
  const validId = asNonEmptyString(id);
  if (!validId || !isUuid(validId)) {
    return apiError({ status: 400, code: "INVALID_ID", message: "Invalid scheduled post id." });
  }

  const planTier = await getPlanTierForOwner(ownerId);
  const plan = getPlanConfig(planTier);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.scheduledPost.findFirst({
        where: { id: validId, ownerId },
      });
      if (!existing) return { type: "missing" as const };

      const needsCapacity = existing.status === "failed" || existing.status === "needs_reconnect";
      const activeScheduledCount = needsCapacity
        ? await tx.scheduledPost.count({ where: activeScheduledPostsWhere(ownerId) })
        : 0;
      const decision = planScheduledRetry({
        post: existing,
        activeCount: activeScheduledCount,
        limit: plan.limits.scheduledPostsActive,
        now: new Date(),
      });

      if (decision.action === "reject_status") {
        throw new Error(decision.message);
      }
      if (decision.action === "unchanged") {
        return { type: "ok" as const, row: existing };
      }
      if (decision.action === "plan_limit") {
        return { type: "plan_limit" as const, activeScheduledCount };
      }
      if (decision.action !== "retry") {
        return { type: "missing" as const };
      }

      const row = await tx.scheduledPost.update({
        where: { id: validId },
        data: decision.update,
      });

      await tx.postHistory.create({
        data: {
          ownerId,
          scheduledPostId: row.id,
          eventType: decision.history.eventType,
          message: decision.history.message,
        },
      });
      return { type: "ok" as const, row };
    });

    if (result.type === "missing") {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Scheduled post not found." });
    }
    if (result.type === "plan_limit") {
      return apiError({
        status: 403,
        code: "PLAN_LIMIT_SCHEDULED_POSTS",
        message:
          `You have reached your ${plan.label} limit of ${plan.limits.scheduledPostsActive} active scheduled posts. Upgrade to Pro to schedule more.`,
        details: `owner=${ownerId}; plan=${planTier}; activeScheduled=${result.activeScheduledCount}`,
      });
    }
    return NextResponse.json({ data: result.row });
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return apiError({
      status: 400,
      code: "RETRY_FAILED",
      message: "Failed to retry this scheduled post.",
      details,
    });
  }
}

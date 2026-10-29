import { NextResponse } from "next/server";
import { interpretOptimisticCancel } from "@/lib/active-scheduled-posts";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { accountGateApiError, checkOwnerAccountGates } from "@/src/lib/auth/user-status";
import { getCurrentOwnerId } from "@/src/lib/auth/session";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type CancelBody = {
  message?: string;
};

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(_: Request, { params }: Params) {
  const ownerId = await getCurrentOwnerId();
  const policyGate = await checkOwnerAccountGates(ownerId, { requireVerifiedEmail: false });
  if (policyGate) return accountGateApiError(policyGate);
  const { id } = await params;
  const validId = asNonEmptyString(id);
  if (!validId || !isUuid(validId)) {
    return apiError({ status: 400, code: "INVALID_ID", message: "Invalid scheduled post id." });
  }

  try {
    const row = await prisma.scheduledPost.findFirst({
      where: { id: validId, ownerId },
    });
    if (!row) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Scheduled post not found." });
    }
    return NextResponse.json({ data: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return apiError({ status: 500, code: "FETCH_FAILED", message: "Failed to fetch scheduled post.", details: message });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const ownerId = await getCurrentOwnerId();
  const policyGate = await checkOwnerAccountGates(ownerId, { requireVerifiedEmail: true });
  if (policyGate) return accountGateApiError(policyGate);
  const { id } = await params;
  const validId = asNonEmptyString(id);
  if (!validId || !isUuid(validId)) {
    return apiError({ status: 400, code: "INVALID_ID", message: "Invalid scheduled post id." });
  }

  let rawBody: unknown = {};
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 0) {
      rawBody = await request.json();
    }
  } catch {
    return apiError({ status: 400, code: "INVALID_JSON", message: "Invalid JSON body." });
  }
  const body = (rawBody ?? {}) as CancelBody;
  const message = asNonEmptyString(body.message) ?? "Scheduled post cancelled.";

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.scheduledPost.updateMany({
        where: {
          id: validId,
          ownerId,
          status: "scheduled",
        },
        data: {
          status: "cancelled",
          lastError: null,
        },
      });

      if (updateResult.count === 1) {
        const row = await tx.scheduledPost.findFirst({
          where: { id: validId, ownerId },
        });
        if (!row) {
          return { kind: "missing" as const };
        }
        await tx.postHistory.create({
          data: {
            ownerId,
            scheduledPostId: row.id,
            eventType: "cancelled",
            message,
          },
        });
        return { kind: "cancelled" as const, row };
      }

      const existing = await tx.scheduledPost.findFirst({
        where: { id: validId, ownerId },
        select: { id: true, status: true },
      });
      const interpreted = interpretOptimisticCancel({
        updatedCount: updateResult.count,
        currentStatus: existing?.status ?? null,
      });
      if (interpreted.action === "missing") {
        return { kind: "missing" as const };
      }
      if (interpreted.action === "already_cancelled" && existing) {
        const row = await tx.scheduledPost.findFirst({
          where: { id: validId, ownerId },
        });
        return row ? { kind: "already_cancelled" as const, row } : { kind: "missing" as const };
      }
      return {
        kind: "conflict" as const,
        status: existing?.status ?? "unknown",
      };
    });

    if (outcome.kind === "missing") {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Scheduled post not found." });
    }
    if (outcome.kind === "conflict") {
      return apiError({
        status: 409,
        code: "CANCEL_CONFLICT",
        message: "This post can no longer be cancelled because its status changed.",
        details: `status=${outcome.status}`,
      });
    }

    return NextResponse.json({ data: outcome.row });
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return apiError({ status: 500, code: "CANCEL_FAILED", message: "Failed to cancel scheduled post.", details });
  }
}

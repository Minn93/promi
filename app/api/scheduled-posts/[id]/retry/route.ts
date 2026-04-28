import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";

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
  const { id } = await params;
  const validId = asNonEmptyString(id);
  if (!validId || !isUuid(validId)) {
    return apiError({ status: 400, code: "INVALID_ID", message: "Invalid scheduled post id." });
  }

  try {
    const retried = await prisma.$transaction(async (tx) => {
      const existing = await tx.scheduledPost.findUnique({ where: { id: validId } });
      if (!existing) return null;
      if (existing.status === "published" || existing.status === "cancelled" || existing.status === "processing") {
        throw new Error(`Cannot retry post in status ${existing.status}.`);
      }
      if (existing.status !== "failed" && existing.status !== "needs_reconnect") {
        return existing;
      }

      const now = new Date();
      const row = await tx.scheduledPost.update({
        where: { id: validId },
        data: {
          status: "scheduled",
          scheduledAt: now,
          processingStartedAt: null,
          lastError: null,
          errorMessage: null,
          errorCode: null,
        },
      });

      await tx.postHistory.create({
        data: {
          scheduledPostId: row.id,
          eventType: "retried",
          message: "Requeued for retry.",
        },
      });
      return row;
    });

    if (!retried) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Scheduled post not found." });
    }
    return NextResponse.json({ data: retried });
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

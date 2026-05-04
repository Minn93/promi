import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
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
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.scheduledPost.findFirst({
        where: { id: validId, ownerId },
      });
      if (!existing) return null;

      if (existing.status === "cancelled") {
        return existing;
      }

      const row = await tx.scheduledPost.update({
        where: { id: validId },
        data: {
          status: "cancelled",
          lastError: null,
        },
      });

      await tx.postHistory.create({
        data: {
          ownerId,
          scheduledPostId: row.id,
          eventType: "cancelled",
          message,
        },
      });

      return row;
    });

    if (!updated) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Scheduled post not found." });
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return apiError({ status: 500, code: "CANCEL_FAILED", message: "Failed to cancel scheduled post.", details });
  }
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type EditBody = {
  contentPayload?: Record<string, unknown>;
  scheduledAt?: string;
};

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hasNonEmptyContent(payload: Record<string, unknown>): boolean {
  return Object.values(payload).some((value) => {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value != null;
  });
}

function parseBody(raw: unknown): EditBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const scheduledAt = asNonEmptyString(obj.scheduledAt);
  const payloadRaw = obj.contentPayload;
  if (!scheduledAt || !payloadRaw || typeof payloadRaw !== "object" || Array.isArray(payloadRaw)) return null;
  return {
    scheduledAt,
    contentPayload: payloadRaw as Record<string, unknown>,
  };
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const validId = asNonEmptyString(id);
  if (!validId || !isUuid(validId)) {
    return apiError({ status: 400, code: "INVALID_ID", message: "Invalid scheduled post id." });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError({ status: 400, code: "INVALID_JSON", message: "Invalid JSON body." });
  }

  const body = parseBody(rawBody);
  if (!body) {
    return apiError({
      status: 400,
      code: "INVALID_INPUT",
      message: "Required fields: contentPayload (object), scheduledAt (ISO datetime).",
    });
  }
  if (!hasNonEmptyContent(body.contentPayload ?? {})) {
    return apiError({
      status: 400,
      code: "EMPTY_CONTENT",
      message: "Content payload must include at least one non-empty field.",
    });
  }

  const scheduledAt = parseDate(body.scheduledAt ?? "");
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

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.scheduledPost.findUnique({ where: { id: validId } });
      if (!existing) return null;
      if (existing.status !== "scheduled") {
        throw new Error(`Only scheduled posts can be edited (current status: ${existing.status}).`);
      }

      const row = await tx.scheduledPost.update({
        where: { id: validId },
        data: {
          contentPayload: body.contentPayload as Prisma.InputJsonValue,
          scheduledAt,
        },
      });

      await tx.postHistory.create({
        data: {
          scheduledPostId: row.id,
          eventType: "scheduled",
          message: "Scheduled post updated by user.",
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
    return apiError({
      status: 400,
      code: "EDIT_FAILED",
      message: "Failed to edit scheduled post.",
      details,
    });
  }
}

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { getCurrentOwnerId } from "@/src/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(request: Request) {
  const ownerId = await getCurrentOwnerId();
  const { searchParams } = new URL(request.url);
  const scheduledPostId = asNonEmptyString(searchParams.get("scheduledPostId"));
  const limitRaw = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
  if (scheduledPostId && !isUuid(scheduledPostId)) {
    return apiError({ status: 400, code: "INVALID_ID", message: "scheduledPostId must be a valid id." });
  }

  try {
    const rows = await prisma.postHistory.findMany({
      where: scheduledPostId ? { ownerId, scheduledPostId } : { ownerId },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      include: {
        scheduledPost: {
          select: {
            status: true,
            platform: true,
          },
        },
      },
    });
    const data = rows.map((row) => ({
      id: row.id,
      scheduledPostId: row.scheduledPostId,
      eventType: row.eventType,
      channel: row.channel,
      message: row.message,
      createdAt: row.createdAt,
      status: row.scheduledPost?.status ?? null,
      platform: row.scheduledPost?.platform ?? null,
    }));
    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return apiError({ status: 500, code: "LIST_FAILED", message: "Failed to list post history.", details });
  }
}

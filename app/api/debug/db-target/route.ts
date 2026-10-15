import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function notFound() {
  return new NextResponse(null, { status: 404 });
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

function databaseHost(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw).hostname || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview" || !authorized(request)) return notFound();

  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database() AS current_database
  `;

  return NextResponse.json(
    {
      currentDatabase: rows[0]?.current_database ?? null,
      host: databaseHost(process.env.DATABASE_URL),
      nodeEnv: process.env.NODE_ENV ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      gitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { disconnectAccount, listAccounts } from "@/src/lib/services/connected-accounts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET() {
  try {
    const ownerId = getCurrentOwnerId();
    const accounts = await listAccounts(ownerId);
    return NextResponse.json(
      { data: accounts },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return apiError({ status: 500, code: "LIST_FAILED", message: "Failed to list connected accounts.", details });
  }
}

export async function PATCH(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError({ status: 400, code: "INVALID_JSON", message: "Invalid JSON body." });
  }

  const body = (rawBody ?? {}) as Record<string, unknown>;
  const accountId = asNonEmptyString(body.accountId);
  const action = asNonEmptyString(body.action);
  if (!accountId || action !== "disconnect") {
    return apiError({
      status: 400,
      code: "INVALID_INPUT",
      message: "Provide accountId and action=disconnect.",
    });
  }

  try {
    const ownerId = getCurrentOwnerId();
    const result = await disconnectAccount(ownerId, accountId);
    if (result.count !== 1) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Connected account not found." });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return apiError({
      status: 500,
      code: "DISCONNECT_FAILED",
      message: "Failed to disconnect account.",
      details,
    });
  }
}

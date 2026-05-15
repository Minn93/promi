import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  OneTimeTokenConsumeError,
  completeInviteAcceptWithToken,
} from "@/src/lib/auth/one-time-tokens";
import { consumeRateLimit, getClientIpFromRequest, RATE_LIMITS, rateLimitFailureResponse } from "@/src/lib/rate-limit/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BCRYPT_COST = 12;

export async function POST(request: Request) {
  let token = "";
  let newPassword = "";
  try {
    const body = (await request.json()) as unknown;
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    token = typeof record.token === "string" ? record.token.trim() : "";
    newPassword = typeof record.newPassword === "string" ? record.newPassword : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!token || newPassword.length < 8) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        message: "An invite token and a new password (at least 8 characters) are required.",
      },
      { status: 400 },
    );
  }

  const ip = getClientIpFromRequest(request);
  const rl = await consumeRateLimit({
    namespace: "accept_invite",
    identifier: ip,
    max: RATE_LIMITS.acceptInvite.max,
    window: RATE_LIMITS.acceptInvite.window,
  });
  if (!rl.ok) return rateLimitFailureResponse(rl);

  try {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await completeInviteAcceptWithToken(token, passwordHash);
  } catch (err) {
    if (err instanceof OneTimeTokenConsumeError) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_token",
          message: "This invite link is invalid, expired, or already used. Ask your administrator for a new invite.",
        },
        { status: 400 },
      );
    }
    console.error("[auth/accept-invite] unexpected", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: "Something went wrong. Please try again later.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Your account is ready. You can sign in with your new password.",
  });
}

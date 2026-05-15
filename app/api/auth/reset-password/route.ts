import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  OneTimeTokenConsumeError,
  completePasswordResetWithToken,
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
        message: "A reset token and a new password (at least 8 characters) are required.",
      },
      { status: 400 },
    );
  }

  const ip = getClientIpFromRequest(request);
  const rl = await consumeRateLimit({
    namespace: "reset_password",
    identifier: ip,
    max: RATE_LIMITS.resetPassword.max,
    window: RATE_LIMITS.resetPassword.window,
  });
  if (!rl.ok) return rateLimitFailureResponse(rl);

  try {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await completePasswordResetWithToken(token, passwordHash);
  } catch (err) {
    if (err instanceof OneTimeTokenConsumeError) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_token",
          message: "This reset link is invalid or has expired. Please request a new password reset.",
        },
        { status: 400 },
      );
    }
    console.error("[auth/reset-password] unexpected", {
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
    message: "Your password has been updated. You can sign in with your new password.",
  });
}

import { NextResponse } from "next/server";
import { replacePasswordResetToken } from "@/src/lib/auth/one-time-tokens";
import { sendPasswordResetEmail } from "@/src/lib/auth/password-reset-mail";
import { prisma } from "@/lib/prisma";
import {
  consumeRateLimit,
  getClientIpFromRequest,
  hashEmailForRateLimit,
  RATE_LIMITS,
  rateLimitFailureResponse,
} from "@/src/lib/rate-limit/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generic client-safe body for all outcomes (enumeration-safe). */
const GENERIC_OK = {
  ok: true as const,
  message: "If an account exists for this email, password reset instructions will be sent shortly.",
};

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function getRequestOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export async function POST(request: Request) {
  let emailRaw = "";
  try {
    const body = (await request.json()) as unknown;
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    emailRaw = normalizeEmail(record.email);
  } catch {
    return NextResponse.json({ error: "invalid_request", message: "Invalid JSON body." }, { status: 400 });
  }

  if (!emailRaw || !emailRaw.includes("@")) {
    return NextResponse.json({ error: "invalid_request", message: "A valid email is required." }, { status: 400 });
  }

  const ip = getClientIpFromRequest(request);
  const rl = await consumeRateLimit({
    namespace: "forgot_password",
    identifier: `${hashEmailForRateLimit(emailRaw)}:${ip}`,
    max: RATE_LIMITS.forgotPassword.max,
    window: RATE_LIMITS.forgotPassword.window,
  });
  if (!rl.ok) return rateLimitFailureResponse(rl);

  const requestOrigin = getRequestOrigin(request);

  try {
    const user = await prisma.user.findUnique({
      where: { email: emailRaw },
      select: { id: true, email: true, disabled: true, passwordHash: true },
    });

    if (user && !user.disabled && user.passwordHash) {
      const { rawToken } = await replacePasswordResetToken(user.id, 60);
      try {
        await sendPasswordResetEmail({
          to: user.email,
          rawToken,
          requestOrigin,
        });
      } catch (err) {
        console.error("[auth/forgot-password] mail_failed", {
          userId: user.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error("[auth/forgot-password] unexpected", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json(GENERIC_OK);
}

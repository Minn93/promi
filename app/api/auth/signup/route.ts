import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  consumeRateLimit,
  getClientIpFromRequest,
  hashEmailForRateLimit,
  RATE_LIMITS,
  rateLimitFailureResponse,
} from "@/src/lib/rate-limit/server";
import { isPublicBetaSignupEnabledServer } from "@/src/lib/internal-beta-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export async function POST(request: Request) {
  if (!isPublicBetaSignupEnabledServer()) {
    return NextResponse.json(
      {
        ok: false,
        error: "signup_disabled",
        message: "Public beta signup is currently closed.",
      },
      { status: 403 },
    );
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as unknown;
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    email = normalizeEmail(record.email);
    password = typeof record.password === "string" ? record.password : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!email.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "invalid_request", message: "A valid email is required." },
      { status: 400 },
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        message: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  const ip = getClientIpFromRequest(request);
  const rl = await consumeRateLimit({
    namespace: "signup",
    identifier: `${hashEmailForRateLimit(email)}:${ip}`,
    max: RATE_LIMITS.signup.max,
    window: RATE_LIMITS.signup.window,
  });
  if (!rl.ok) return rateLimitFailureResponse(rl);

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          disabled: false,
          emailVerified: new Date(),
        },
        select: { id: true },
      });

      // Guarantee self-serve users resolve to Free regardless of env fallback defaults.
      await tx.ownerEntitlement.upsert({
        where: { ownerId: user.id },
        update: {
          planTier: "free",
          status: "active",
          source: "signup",
          expiresAt: null,
          updatedBy: "public_signup",
          notes: "Created by public beta self-serve signup.",
        },
        create: {
          ownerId: user.id,
          planTier: "free",
          status: "active",
          source: "signup",
          updatedBy: "public_signup",
          notes: "Created by public beta self-serve signup.",
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          ok: false,
          error: "email_exists",
          message: "An account with this email already exists. Sign in or reset your password.",
        },
        { status: 409 },
      );
    }
    console.error("[auth/signup] unexpected", {
      message: error instanceof Error ? error.message : String(error),
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
    message: "Account created. You can now sign in.",
  });
}

import { createHmac, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** Contract: keep in sync with password reset / invite HTTP handlers (Phase 14.8+). */
export const ONE_TIME_TOKEN_TYPE = {
  PASSWORD_RESET: "password_reset",
  INVITE_ACCEPT: "invite_accept",
  EMAIL_VERIFY: "email_verify",
} as const;

export type OneTimeTokenType = (typeof ONE_TIME_TOKEN_TYPE)[keyof typeof ONE_TIME_TOKEN_TYPE];

export type CreateOneTimeTokenInput = {
  userId: string;
  type: OneTimeTokenType;
  expiresInMinutes: number;
  metadata?: Prisma.InputJsonValue;
};

export type CreateOneTimeTokenResult = {
  id: string;
  /** Deliver via email only. Never log or persist. */
  rawToken: string;
};

export type ConsumeOneTimeTokenResult = {
  id: string;
  userId: string;
  type: string;
  metadata: Prisma.JsonValue | null;
};

function getTokenPepper(): string {
  const s = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "").trim();
  if (!s) {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for one-time tokens");
  }
  return s;
}

/** Deterministic server-side digest; store only this in the database. */
export function hashOneTimeTokenPlaintext(rawToken: string): string {
  return createHmac("sha256", getTokenPepper()).update(rawToken, "utf8").digest("hex");
}

function newUrlSafeToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Creates a row with hashed token. Returns the raw token once for the caller to embed in a link.
 * Never logs the raw token.
 */
export async function createOneTimeToken(input: CreateOneTimeTokenInput): Promise<CreateOneTimeTokenResult> {
  const min = input.expiresInMinutes;
  if (!Number.isFinite(min) || min <= 0 || min > 60 * 24 * 14) {
    throw new Error("expiresInMinutes must be between 1 and 20160 (14 days)");
  }

  const rawToken = newUrlSafeToken();
  const tokenHash = hashOneTimeTokenPlaintext(rawToken);
  const expiresAt = new Date(Date.now() + min * 60 * 1000);

  const row = await prisma.authOneTimeToken.create({
    data: {
      userId: input.userId,
      type: input.type,
      tokenHash,
      expiresAt,
      metadata: input.metadata ?? undefined,
    },
  });

  return { id: row.id, rawToken };
}

export class OneTimeTokenConsumeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OneTimeTokenConsumeError";
  }
}

/**
 * Atomically consumes a valid token. Rejects missing, expired, or already-used tokens.
 * Use a generic error message for callers to surface to end users (enumeration-safe).
 */
export async function consumeOneTimeToken(
  plainToken: string,
  type: OneTimeTokenType,
): Promise<ConsumeOneTimeTokenResult> {
  const trimmed = typeof plainToken === "string" ? plainToken.trim() : "";
  if (!trimmed) {
    throw new OneTimeTokenConsumeError("invalid_token");
  }

  const tokenHash = hashOneTimeTokenPlaintext(trimmed);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const row = await tx.authOneTimeToken.findUnique({
      where: { type_tokenHash: { type, tokenHash } },
    });

    if (!row) {
      throw new OneTimeTokenConsumeError("invalid_token");
    }
    if (row.consumedAt) {
      throw new OneTimeTokenConsumeError("invalid_token");
    }
    if (row.expiresAt <= now) {
      throw new OneTimeTokenConsumeError("invalid_token");
    }

    const updated = await tx.authOneTimeToken.updateMany({
      where: {
        id: row.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    if (updated.count !== 1) {
      throw new OneTimeTokenConsumeError("invalid_token");
    }

    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      metadata: row.metadata,
    };
  });
}

const PASSWORD_RESET_MAX_TTL_MINUTES = 60;

/**
 * Deletes unconsumed `password_reset` rows for the user, then creates a new token (single active reset).
 * Invite / email_verify tokens are untouched.
 */
export async function replacePasswordResetToken(
  userId: string,
  expiresInMinutes: number,
): Promise<CreateOneTimeTokenResult> {
  const min = expiresInMinutes;
  if (!Number.isFinite(min) || min <= 0 || min > PASSWORD_RESET_MAX_TTL_MINUTES) {
    throw new Error(
      `expiresInMinutes for password reset must be between 1 and ${PASSWORD_RESET_MAX_TTL_MINUTES}`,
    );
  }

  const rawToken = newUrlSafeToken();
  const tokenHash = hashOneTimeTokenPlaintext(rawToken);
  const expiresAt = new Date(Date.now() + min * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    await tx.authOneTimeToken.deleteMany({
      where: {
        userId,
        type: ONE_TIME_TOKEN_TYPE.PASSWORD_RESET,
        consumedAt: null,
      },
    });
    const row = await tx.authOneTimeToken.create({
      data: {
        userId,
        type: ONE_TIME_TOKEN_TYPE.PASSWORD_RESET,
        tokenHash,
        expiresAt,
      },
    });
    return { id: row.id, rawToken };
  });
}

/**
 * Consumes a password_reset token and updates the user's password in one transaction.
 * Sets `emailVerified` — completing a reset proves inbox control (documented in Phase 14.8).
 */
export async function completePasswordResetWithToken(
  plainToken: string,
  passwordHash: string,
): Promise<void> {
  const trimmed = typeof plainToken === "string" ? plainToken.trim() : "";
  if (!trimmed) {
    throw new OneTimeTokenConsumeError("invalid_token");
  }

  const tokenHash = hashOneTimeTokenPlaintext(trimmed);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const row = await tx.authOneTimeToken.findUnique({
      where: {
        type_tokenHash: { type: ONE_TIME_TOKEN_TYPE.PASSWORD_RESET, tokenHash },
      },
    });

    if (!row || row.consumedAt || row.expiresAt <= now) {
      throw new OneTimeTokenConsumeError("invalid_token");
    }

    const user = await tx.user.findUnique({ where: { id: row.userId } });
    if (!user || user.disabled || !user.passwordHash) {
      throw new OneTimeTokenConsumeError("invalid_token");
    }

    const consumed = await tx.authOneTimeToken.updateMany({
      where: {
        id: row.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    if (consumed.count !== 1) {
      throw new OneTimeTokenConsumeError("invalid_token");
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerified: new Date(),
      },
    });
  });
}

const INVITE_ACCEPT_MAX_TTL_MINUTES = 60 * 24 * 14;

/**
 * Deletes unconsumed `invite_accept` rows for the user, then creates a new token.
 * Password reset / email_verify tokens are untouched.
 */
export async function replaceInviteAcceptToken(
  userId: string,
  expiresInMinutes: number,
): Promise<CreateOneTimeTokenResult> {
  const min = expiresInMinutes;
  if (!Number.isFinite(min) || min <= 0 || min > INVITE_ACCEPT_MAX_TTL_MINUTES) {
    throw new Error(
      `expiresInMinutes for invite_accept must be between 1 and ${INVITE_ACCEPT_MAX_TTL_MINUTES} (14 days)`,
    );
  }

  const rawToken = newUrlSafeToken();
  const tokenHash = hashOneTimeTokenPlaintext(rawToken);
  const expiresAt = new Date(Date.now() + min * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    await tx.authOneTimeToken.deleteMany({
      where: {
        userId,
        type: ONE_TIME_TOKEN_TYPE.INVITE_ACCEPT,
        consumedAt: null,
      },
    });
    const row = await tx.authOneTimeToken.create({
      data: {
        userId,
        type: ONE_TIME_TOKEN_TYPE.INVITE_ACCEPT,
        tokenHash,
        expiresAt,
      },
    });
    return { id: row.id, rawToken };
  });
}

/**
 * First-time onboarding: user must exist, not disabled, and have no password yet.
 * Sets password + emailVerified (inbox possession via invite link).
 */
export async function completeInviteAcceptWithToken(
  plainToken: string,
  passwordHash: string,
): Promise<void> {
  const trimmed = typeof plainToken === "string" ? plainToken.trim() : "";
  if (!trimmed) {
    throw new OneTimeTokenConsumeError("invalid_token");
  }

  const tokenHash = hashOneTimeTokenPlaintext(trimmed);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const row = await tx.authOneTimeToken.findUnique({
      where: {
        type_tokenHash: { type: ONE_TIME_TOKEN_TYPE.INVITE_ACCEPT, tokenHash },
      },
    });

    if (!row || row.consumedAt || row.expiresAt <= now) {
      throw new OneTimeTokenConsumeError("invalid_token");
    }

    const user = await tx.user.findUnique({ where: { id: row.userId } });
    if (!user || user.disabled || user.passwordHash != null) {
      throw new OneTimeTokenConsumeError("invalid_token");
    }

    const consumed = await tx.authOneTimeToken.updateMany({
      where: {
        id: row.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    if (consumed.count !== 1) {
      throw new OneTimeTokenConsumeError("invalid_token");
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerified: new Date(),
      },
    });
  });
}

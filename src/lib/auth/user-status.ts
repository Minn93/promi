import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { isInternalBetaModeServer } from "@/src/lib/internal-beta-mode";

/** Snapshot for account policy gates (no PII in object). Internal beta bypasses DB reads. */
export type OwnerAccountGateSnapshot =
  | "internal_beta"
  | {
      exists: boolean;
      disabled: boolean;
      emailVerified: boolean;
    };

export type AccountGateFailure =
  | { kind: "account_unavailable" }
  | { kind: "email_verification_required" };

/**
 * Load minimal User flags for `ownerId` (maps to `User.id` in real-auth).
 * Internal beta: returns `internal_beta` (callers should treat as allowed).
 */
export async function getOwnerAccountGateSnapshot(ownerId: string): Promise<OwnerAccountGateSnapshot> {
  if (isInternalBetaModeServer()) return "internal_beta";
  const id = ownerId.trim();
  if (!id) {
    return { exists: false, disabled: false, emailVerified: false };
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: { disabled: true, emailVerified: true },
  });
  if (!user) {
    return { exists: false, disabled: false, emailVerified: false };
  }
  return {
    exists: true,
    disabled: user.disabled,
    emailVerified: user.emailVerified != null,
  };
}

export function assertOwnerAccountGates(
  snapshot: OwnerAccountGateSnapshot,
  opts: { requireVerifiedEmail: boolean },
): AccountGateFailure | null {
  if (snapshot === "internal_beta") return null;
  if (!snapshot.exists || snapshot.disabled) {
    return { kind: "account_unavailable" };
  }
  if (opts.requireVerifiedEmail && !snapshot.emailVerified) {
    return { kind: "email_verification_required" };
  }
  return null;
}

export async function checkOwnerAccountGates(
  ownerId: string,
  opts: { requireVerifiedEmail: boolean },
): Promise<AccountGateFailure | null> {
  const snapshot = await getOwnerAccountGateSnapshot(ownerId);
  return assertOwnerAccountGates(snapshot, opts);
}

export function accountGateNextResponse(failure: AccountGateFailure): NextResponse {
  if (failure.kind === "account_unavailable") {
    return NextResponse.json(
      { error: "account_unavailable", message: "This account is not available." },
      { status: 403 },
    );
  }
  return NextResponse.json(
    {
      error: "email_verification_required",
      message: "Email verification is required for this action.",
    },
    { status: 403 },
  );
}

export function accountGateApiError(failure: AccountGateFailure) {
  if (failure.kind === "account_unavailable") {
    return apiError({
      status: 403,
      code: "ACCOUNT_UNAVAILABLE",
      message: "This account is not available.",
    });
  }
  return apiError({
    status: 403,
    code: "EMAIL_VERIFICATION_REQUIRED",
    message: "Email verification is required for this action.",
  });
}

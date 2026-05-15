import {
  getInternalBetaOwnerId,
  isInternalBetaModeServer,
  isUnsafePublicLaunchAttemptServer,
} from "@/src/lib/internal-beta-mode";
import { getServerSession } from "next-auth";
import { authOptions } from "@/src/lib/auth/next-auth";

function readAuthenticatedUserId(session: unknown): string | null {
  if (!session || typeof session !== "object") return null;
  const raw = (session as { user?: { id?: unknown } }).user?.id;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function resolveCurrentOwnerId() {
  // This guard prevents accidental "public SaaS" deployment with dev-auth still enabled.
  if (isUnsafePublicLaunchAttemptServer()) {
    throw new Error(
      "Promi is blocked in this production configuration (not internal beta and PROMI_AUTH_PRODUCT_READY is not enabled). " +
        "Set PROMI_INTERNAL_BETA_MODE=1 for internal beta, or PROMI_AUTH_PRODUCT_READY=1 once DB-backed auth is deployed.",
    );
  }

  const session = await getServerSession(authOptions);
  const userId = readAuthenticatedUserId(session);
  if (userId) {
    return userId;
  }

  // Unauthenticated: internal beta falls back to the shared beta owner id (proxy may bypass JWT).
  // Authenticated users must always use the path above so multi-user isolation holds even when
  // PROMI_INTERNAL_BETA_MODE defaults to on.
  if (isInternalBetaModeServer()) {
    return getInternalBetaOwnerId();
  }

  throw new Error(
    "Authentication required in real-auth mode. Sign in before accessing owner-scoped routes.",
  );
}

export async function getCurrentOwnerId() {
  return resolveCurrentOwnerId();
}

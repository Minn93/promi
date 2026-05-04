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
  // Internal beta assumption: a single owner identity is shared until real auth is implemented.
  // This guard prevents accidental "public SaaS" deployment with dev-auth still enabled.
  if (isUnsafePublicLaunchAttemptServer()) {
    throw new Error(
      "Promi is configured for public launch mode, but real auth is not implemented yet. Set PROMI_INTERNAL_BETA_MODE=1 for internal beta deployments.",
    );
  }

  if (isInternalBetaModeServer()) {
    return getInternalBetaOwnerId();
  }

  const session = await getServerSession(authOptions);
  const userId = readAuthenticatedUserId(session);
  if (!userId) {
    throw new Error(
      "Authentication required in real-auth mode. Sign in before accessing owner-scoped routes.",
    );
  }
  return userId;
}

export async function getCurrentOwnerId() {
  return resolveCurrentOwnerId();
}

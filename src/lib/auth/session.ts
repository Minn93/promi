import { getInternalBetaOwnerId, isUnsafePublicLaunchAttemptServer } from "@/src/lib/internal-beta-mode";

export function getCurrentOwnerId() {
  // Internal beta assumption: a single owner identity is shared until real auth is implemented.
  // This guard prevents accidental "public SaaS" deployment with dev-auth still enabled.
  if (isUnsafePublicLaunchAttemptServer()) {
    throw new Error(
      "Promi is configured for public launch mode, but real auth is not implemented yet. Set PROMI_INTERNAL_BETA_MODE=1 for internal beta deployments.",
    );
  }

  return getInternalBetaOwnerId();
}

import { AccountUnavailableState } from "@/components/account-unavailable-state";
import { PageHeader } from "@/components/page-header";
import { SettingsPageContent } from "@/components/settings-page-content";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { checkOwnerAccountGates } from "@/src/lib/auth/user-status";
import { getPlanTierForOwner } from "@/src/lib/plans/server";

export default async function SettingsPage() {
  const ownerId = await getCurrentOwnerId();
  const policyGate = await checkOwnerAccountGates(ownerId, { requireVerifiedEmail: false });
  if (policyGate) {
    return (
      <>
        <PageHeader
          title="Settings"
          description="Manage your account setup, connected platforms, plan usage, and lightweight preferences."
        />
        <AccountUnavailableState
          title="Account unavailable"
          description="Settings are unavailable for disabled accounts."
        />
      </>
    );
  }
  const planTier = await getPlanTierForOwner(ownerId);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your account setup, connected platforms, plan usage, and lightweight preferences."
      />
      <SettingsPageContent ownerId={ownerId} planTier={planTier} />
    </>
  );
}

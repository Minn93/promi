import { PageHeader } from "@/components/page-header";
import { SettingsPageContent } from "@/components/settings-page-content";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { getPlanTierForOwner } from "@/src/lib/plans/server";

export default async function SettingsPage() {
  const ownerId = await getCurrentOwnerId();
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

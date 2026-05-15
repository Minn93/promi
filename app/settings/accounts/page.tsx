import { AccountUnavailableState } from "@/components/account-unavailable-state";
import { ConnectedAccountsPanel } from "@/components/connected-accounts-panel";
import { PageHeader } from "@/components/page-header";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { checkOwnerAccountGates } from "@/src/lib/auth/user-status";

export default async function SettingsAccountsPage() {
  const ownerId = await getCurrentOwnerId();
  const policyGate = await checkOwnerAccountGates(ownerId, { requireVerifiedEmail: false });

  return (
    <>
      <PageHeader
        title="Connected accounts"
        description="Connect social accounts for scheduled publishing, retries, and reconnect recovery."
      />
      {policyGate ? (
        <AccountUnavailableState
          title="Account unavailable"
          description="Connected account details are unavailable for this account."
        />
      ) : (
        <ConnectedAccountsPanel />
      )}
    </>
  );
}

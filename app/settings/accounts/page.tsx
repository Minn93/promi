import { AccountUnavailableState } from "@/components/account-unavailable-state";
import { ConnectedAccountsPanel } from "@/components/connected-accounts-panel";
import { PageHeader } from "@/components/page-header";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { checkOwnerAccountGates } from "@/src/lib/auth/user-status";

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function SettingsAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ownerId = await getCurrentOwnerId();
  const policyGate = await checkOwnerAccountGates(ownerId, { requireVerifiedEmail: false });
  const params = await searchParams;

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
        <ConnectedAccountsPanel
          oauthConnected={firstParam(params.connected)}
          oauthError={firstParam(params.oauth_error)}
          oauthMock={firstParam(params.mock) === "1"}
        />
      )}
    </>
  );
}

import { ConnectedAccountsPanel } from "@/components/connected-accounts-panel";
import { PageHeader } from "@/components/page-header";

export default function SettingsAccountsPage() {
  return (
    <>
      <PageHeader
        title="Connected accounts"
        description="Connect social accounts for scheduled publishing, retries, and reconnect recovery."
      />
      <ConnectedAccountsPanel />
    </>
  );
}

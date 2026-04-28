import { PageHeader } from "@/components/page-header";
import { UpgradeSuccessPanel } from "@/components/upgrade-success-panel";
import { isInternalBetaModeServer } from "@/src/lib/internal-beta-mode";

export default function UpgradeSuccessPage() {
  const internalBetaMode = isInternalBetaModeServer();
  const description =
    internalBetaMode
      ? "Internal beta billing state was updated in simulation mode."
      : "Your Pro subscription state has been updated.";

  return (
    <>
      <PageHeader
        title="Upgrade confirmed"
        description={description}
      />
      <UpgradeSuccessPanel />
    </>
  );
}

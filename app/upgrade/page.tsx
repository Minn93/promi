import { PageHeader } from "@/components/page-header";
import { UpgradePricingFlow } from "@/components/upgrade-pricing-flow";
import { isInternalBetaModeServer } from "@/src/lib/internal-beta-mode";

export default function UpgradePage() {
  const internalBetaMode = isInternalBetaModeServer();
  return (
    <>
      <PageHeader
        title="Upgrade to Pro"
        description={
          internalBetaMode
            ? "Internal beta pricing preview. Billing actions are simulated for single-owner testing."
            : "Simple plans with clear limits for scheduling, accounts, templates, and analytics."
        }
      />
      <UpgradePricingFlow />
    </>
  );
}

import { MockCheckoutPanel } from "@/components/mock-checkout-panel";
import { PageHeader } from "@/components/page-header";
import { isInternalBetaModeServer } from "@/src/lib/internal-beta-mode";

export default function UpgradeCheckoutPage() {
  const internalBetaMode = isInternalBetaModeServer();
  const description =
    internalBetaMode
      ? "Internal beta checkout simulation. No real payment method is collected."
      : "Confirmation step for the Pro upgrade flow.";

  return (
    <>
      <PageHeader
        title="Checkout"
        description={description}
      />
      <MockCheckoutPanel />
    </>
  );
}

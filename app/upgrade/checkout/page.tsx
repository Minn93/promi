import { MockCheckoutPanel } from "@/components/mock-checkout-panel";
import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";

export default function UpgradeCheckoutPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/upgrade");
  }

  return (
    <>
      <PageHeader
        title="Dev-only: billing preview"
        description="Local-storage preview only — it does not change server entitlement. Not available in production."
      />
      <MockCheckoutPanel />
    </>
  );
}

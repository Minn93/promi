import { PageHeader } from "@/components/page-header";
import { UpgradeSuccessPanel } from "@/components/upgrade-success-panel";
import { redirect } from "next/navigation";

export default function UpgradeSuccessPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/upgrade");
  }

  return (
    <>
      <PageHeader
        title="Dev-only: billing preview result"
        description="Shows local preview state after the dev playground step — unrelated to manual Pro entitlement on the server."
      />
      <UpgradeSuccessPanel />
    </>
  );
}

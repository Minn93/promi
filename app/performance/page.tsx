import { PageHeader } from "@/components/page-header";
import { PerformanceOverview } from "@/components/performance-overview";

export default function PerformancePage() {
  return (
    <>
      <PageHeader
        title="Performance"
        description="A device-local snapshot of drafts and saved promotions in this browser — not live published reach."
      />
      <PerformanceOverview />
    </>
  );
}

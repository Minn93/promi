import { PageHeader } from "@/components/page-header";
import { PerformanceOverview } from "@/components/performance-overview";

export default function PerformancePage() {
  return (
    <>
      <PageHeader
        title="Performance"
        description="A simple snapshot of promotions you’ve saved on this device."
      />
      <PerformanceOverview />
    </>
  );
}

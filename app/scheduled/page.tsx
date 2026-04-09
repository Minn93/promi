import { PageHeader } from "@/components/page-header";
import { ScheduledPromotionsList } from "@/components/scheduled-promotions-list";

export default function ScheduledPage() {
  return (
    <>
      <PageHeader title="Scheduled" description="Drafts and scheduled promotions saved on this device." />
      <ScheduledPromotionsList />
    </>
  );
}

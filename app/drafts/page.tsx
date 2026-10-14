import { PageHeader } from "@/components/page-header";
import { ScheduledPromotionsList } from "@/components/scheduled-promotions-list";

export default function DraftsPage() {
  return (
    <>
      <PageHeader
        title="Drafts"
        description="Drafts saved in this browser on this device. Scheduled and published outcomes appear under Scheduled and History."
      />
      <ScheduledPromotionsList
        statusFilter="draft"
        emptySuffix="and save your first draft on the Create page."
      />
    </>
  );
}

import { PageHeader } from "@/components/page-header";
import { ScheduledPromotionsList } from "@/components/scheduled-promotions-list";

export default function DraftsPage() {
  return (
    <>
      <PageHeader title="Drafts" description="Draft promotions saved on this device." />
      <ScheduledPromotionsList
        statusFilter="draft"
        emptySuffix="and save your first draft on the Create page."
      />
    </>
  );
}

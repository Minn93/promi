import { PageHeader } from "@/components/page-header";
import { PostHistoryList } from "@/components/post-history-list";

export default function HistoryPage() {
  return (
    <>
      <PageHeader
        title="History"
        description="Server publishing outcomes. After scheduled time, status updates can appear with a short delay while the scheduler processes the queue."
      />
      <PostHistoryList />
    </>
  );
}

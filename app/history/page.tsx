import { PageHeader } from "@/components/page-header";
import { PostHistoryList } from "@/components/post-history-list";

export default function HistoryPage() {
  return (
    <>
      <PageHeader
        title="History"
        description="Publishing outcomes for your posts. Updates appear after Promi's publishing job processes a post."
      />
      <PostHistoryList />
    </>
  );
}

import { PageHeader } from "@/components/page-header";
import { PostHistoryList } from "@/components/post-history-list";

export default function HistoryPage() {
  return (
    <>
      <PageHeader
        title="History"
        description="What happened to each post, from scheduling through publishing."
      />
      <PostHistoryList />
    </>
  );
}

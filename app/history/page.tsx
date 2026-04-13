import { PageHeader } from "@/components/page-header";
import { PostHistoryList } from "@/components/post-history-list";

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="History" description="Server-side scheduled post history." />
      <PostHistoryList />
    </>
  );
}

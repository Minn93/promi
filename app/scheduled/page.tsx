import { PageHeader } from "@/components/page-header";
import { ServerScheduledPostsList } from "@/components/server-scheduled-posts-list";

export default function ScheduledPage() {
  return (
    <>
      <PageHeader
        title="Scheduled"
        description="Server publishing queue. Posts are picked up automatically and may run a short time after the exact scheduled minute."
      />
      <ServerScheduledPostsList />
    </>
  );
}

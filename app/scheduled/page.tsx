import { PageHeader } from "@/components/page-header";
import { ServerScheduledPostsList } from "@/components/server-scheduled-posts-list";

export default function ScheduledPage() {
  return (
    <>
      <PageHeader
        title="Scheduled"
        description="Upcoming posts and their status. During the beta, posts are sent when Promi's publishing job runs, which can be later than the scheduled time."
      />
      <ServerScheduledPostsList />
    </>
  );
}

import { PageHeader } from "@/components/page-header";
import { ServerScheduledPostsList } from "@/components/server-scheduled-posts-list";

export default function ScheduledPage() {
  return (
    <>
      <PageHeader title="Scheduled" description="Scheduled promotions tracked on the server." />
      <ServerScheduledPostsList />
    </>
  );
}

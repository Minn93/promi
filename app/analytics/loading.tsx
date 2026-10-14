import { PageHeader } from "@/components/page-header";

export default function AnalyticsLoading() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Simple post performance analytics from published posts and history data."
      />
      <div
        className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
        role="status"
        aria-live="polite"
      >
        Loading analytics…
      </div>
    </>
  );
}

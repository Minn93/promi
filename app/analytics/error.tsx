"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export default function AnalyticsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Simple post performance analytics from published posts and history data."
      />
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        role="alert"
      >
        <p className="font-medium">Couldn&apos;t load analytics.</p>
        <p className="mt-1">This is usually temporary. Try again in a moment.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
          >
            Retry
          </button>
          <Link href="/history" className="text-xs font-medium underline underline-offset-2">
            Check History
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-3 text-xs text-red-600/80 dark:text-red-300/80">Support reference: {error.digest}</p>
        ) : null}
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getPostStatusCopy } from "@/lib/post-status-copy";

type ScheduledStatus = "scheduled" | "processing" | "published" | "failed" | "needs_reconnect" | "cancelled";
type AccountStatus = "active" | "expired" | "revoked" | "error";

type ScheduledPost = {
  status: ScheduledStatus;
  scheduledAt: string;
};

type ConnectedAccount = {
  status: AccountStatus;
};

function isToday(iso: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  );
}

export function ReliabilitySummary() {
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setWarning(null);
      try {
        const [scheduledRes, accountsRes] = await Promise.all([
          fetch("/api/scheduled-posts?limit=200", { cache: "no-store" }),
          fetch("/api/connected-accounts", { cache: "no-store" }),
        ]);
        const scheduledBody = (await scheduledRes.json().catch(() => null)) as { data?: ScheduledPost[] } | null;
        const accountsBody = (await accountsRes.json().catch(() => null)) as { data?: ConnectedAccount[] } | null;
        setScheduledPosts(Array.isArray(scheduledBody?.data) ? scheduledBody.data : []);
        setAccounts(Array.isArray(accountsBody?.data) ? accountsBody.data : []);
        if (!scheduledRes.ok || !accountsRes.ok) {
          setWarning("Some reliability details are temporarily unavailable.");
        }
      } catch {
        setWarning("Reliability details are temporarily unavailable.");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const summary = useMemo(() => {
    const failedPosts = scheduledPosts.filter((post) => post.status === "failed").length;
    const reconnectPosts = scheduledPosts.filter((post) => post.status === "needs_reconnect").length;
    const reconnectAccounts = accounts.filter((account) => account.status !== "active").length;
    const upcomingToday = scheduledPosts.filter((post) => post.status === "scheduled" && isToday(post.scheduledAt)).length;
    return { failedPosts, reconnectPosts, reconnectAccounts, upcomingToday };
  }, [scheduledPosts, accounts]);

  return (
    <section aria-labelledby="reliability-summary-heading" className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="reliability-summary-heading" className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Reliability at a glance
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{loading ? "Loading..." : "Live snapshot"}</p>
      </div>
      {warning ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          {warning}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div
          className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
          role="group"
          aria-label={`${getPostStatusCopy("failed").label} posts: ${summary.failedPosts.toLocaleString()} needing retry or reschedule`}
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{getPostStatusCopy("failed").label} posts</p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {summary.failedPosts.toLocaleString()} needing retry or reschedule
          </p>
        </div>
        <div
          className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
          role="group"
          aria-label={`${getPostStatusCopy("needs_reconnect").label}: ${(summary.reconnectAccounts + summary.reconnectPosts).toLocaleString()} accounts or posts need reconnect`}
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{getPostStatusCopy("needs_reconnect").label}</p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {(summary.reconnectAccounts + summary.reconnectPosts).toLocaleString()} accounts/posts need reconnect
          </p>
        </div>
        <div
          className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
          role="group"
          aria-label={`${getPostStatusCopy("scheduled").label} today: ${summary.upcomingToday.toLocaleString()} posts scheduled today`}
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{getPostStatusCopy("scheduled").label} today</p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {summary.upcomingToday.toLocaleString()} posts scheduled today
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <Link href="/scheduled" className="font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300">
          Open Scheduled queue
        </Link>
        <Link href="/settings/accounts" className="font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300">
          Manage accounts
        </Link>
        <Link href="/history" className="font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300">
          Check History
        </Link>
      </div>
    </section>
  );
}

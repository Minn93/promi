"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readPromotions } from "@/lib/promotions-storage";

type ScheduledPost = {
  status: "scheduled" | "processing" | "published" | "failed" | "needs_reconnect" | "cancelled";
};

type ConnectedAccount = {
  status: "active" | "expired" | "revoked" | "error";
};

const DISMISS_KEY = "promi:quick-start:dismissed:v1";

export function QuickStartOnboarding() {
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasConnectedAccount, setHasConnectedAccount] = useState(false);
  const [hasAnyDraftOrScheduled, setHasAnyDraftOrScheduled] = useState(false);
  const [hasAnyScheduledPost, setHasAnyScheduledPost] = useState(false);
  const [hasAnyHistoryOrPublished, setHasAnyHistoryOrPublished] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const localPromotions = readPromotions().items;
        setHasAnyDraftOrScheduled(localPromotions.length > 0);

        const [accountsRes, scheduledRes, historyRes] = await Promise.all([
          fetch("/api/connected-accounts", { cache: "no-store" }),
          fetch("/api/scheduled-posts?limit=200", { cache: "no-store" }),
          fetch("/api/post-history?limit=1", { cache: "no-store" }),
        ]);

        const accountsBody = (await accountsRes.json().catch(() => null)) as { data?: ConnectedAccount[] } | null;
        const scheduledBody = (await scheduledRes.json().catch(() => null)) as { data?: ScheduledPost[] } | null;
        const historyBody = (await historyRes.json().catch(() => null)) as { data?: Array<unknown> } | null;

        const accounts = Array.isArray(accountsBody?.data) ? accountsBody.data : [];
        const scheduledPosts = Array.isArray(scheduledBody?.data) ? scheduledBody.data : [];
        const historyRows = Array.isArray(historyBody?.data) ? historyBody.data : [];

        setHasConnectedAccount(accounts.some((acc) => acc.status === "active"));
        setHasAnyScheduledPost(
          scheduledPosts.some((post) =>
            post.status === "scheduled"
            || post.status === "processing"
            || post.status === "published"
            || post.status === "failed"
            || post.status === "needs_reconnect"),
        );
        setHasAnyHistoryOrPublished(
          historyRows.length > 0
          || scheduledPosts.some((post) => post.status === "published"),
        );
      } catch {
        // Keep defaults; guidance still useful
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const steps = useMemo(
    () => [
      { label: "Connect an account", done: hasConnectedAccount, href: "/settings/accounts" },
      { label: "Create your first post", done: hasAnyDraftOrScheduled, href: "/create" },
      { label: "Schedule a post", done: hasAnyScheduledPost, href: "/scheduled" },
      { label: "Review history and analytics", done: hasAnyHistoryOrPublished, href: "/history" },
    ],
    [hasConnectedAccount, hasAnyDraftOrScheduled, hasAnyScheduledPost, hasAnyHistoryOrPublished],
  );

  const firstIncomplete = steps.find((step) => !step.done);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  const showAgain = () => {
    setDismissed(false);
    try {
      window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      // ignore
    }
  };

  if (dismissed) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
        Quick start is hidden.
        <button
          type="button"
          onClick={showAgain}
          className="ml-2 font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100"
        >
          Show again
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Quick start</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Get Promi ready in a few steps: connect, create, schedule, then check outcomes in History.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Dismiss
        </button>
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((step, idx) => (
          <li key={step.label} className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="mr-2 text-xs text-zinc-500 dark:text-zinc-400">{idx + 1}.</span>
              {step.label}
            </p>
            {step.done ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Done
              </span>
            ) : (
              <Link
                href={step.href}
                className="text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100"
              >
                Start
              </Link>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {loading ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">
            Checking your setup progress...
          </p>
        ) : firstIncomplete ? (
          <>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Next step:</p>
            <Link
              href={firstIncomplete.href}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {firstIncomplete.label}
            </Link>
          </>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">You are fully set up. Keep momentum by scheduling your next post.</p>
        )}
      </div>
    </section>
  );
}

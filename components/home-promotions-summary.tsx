"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readPromotions } from "@/lib/promotions-storage";

export function HomePromotionsSummary() {
  const [mounted, setMounted] = useState(false);
  const [total, setTotal] = useState(0);
  const [drafts, setDrafts] = useState(0);
  const [scheduled, setScheduled] = useState(0);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const result = readPromotions();
    setStorageWarning(result.warning ?? null);
    const items = result.items;
    setTotal(items.length);
    setDrafts(items.filter((p) => p.status === "draft").length);
    setScheduled(items.filter((p) => p.status === "scheduled").length);
  }, []);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:p-7">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Your promotions
      </h2>
      {!mounted ? (
        <div className="mt-3 h-5 w-52 max-w-full rounded bg-zinc-100 dark:bg-zinc-800" aria-hidden />
      ) : (
        <>
          {storageWarning ? (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {storageWarning}
            </p>
          ) : null}
          {total === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Nothing saved on this device yet.{" "}
              <Link
                href="/products"
                className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50"
              >
                Choose a product
              </Link>{" "}
              to create a promotion.
            </p>
          ) : (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{total}</span>{" "}
              saved on this device
              <span className="text-zinc-400 dark:text-zinc-500"> · </span>
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{drafts}</span>{" "}
              draft{drafts === 1 ? "" : "s"}
              <span className="text-zinc-400 dark:text-zinc-500"> · </span>
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{scheduled}</span>{" "}
              scheduled
            </p>
          )}
          {total > 0 ? (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              <Link href="/drafts" className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300">
                Drafts
              </Link>
              {" · "}
              <Link href="/scheduled" className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300">
                Scheduled
              </Link>
              {" · "}
              <Link href="/performance" className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300">
                Performance
              </Link>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

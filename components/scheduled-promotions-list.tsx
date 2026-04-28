"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readPromotions, removePromotionById } from "@/lib/promotions-storage";
import type { Promotion } from "@/lib/types";

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatScheduledAt(iso: string | null): string {
  if (!iso) return "Not set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return dateTimeFormatter.format(d);
}

function channelLabel(id: string): string {
  if (id === "instagram") return "Instagram";
  if (id === "pinterest") return "Pinterest";
  return id;
}

function statusLabel(status: Promotion["status"]): string {
  return status === "draft" ? "Draft" : "Scheduled";
}

function contentPreview(p: Promotion): string {
  const raw = p.instagramCaption.trim() || p.pinterestTitle.trim() || p.pinterestDescription.trim();
  const text = raw.replace(/\s+/g, " ");
  if (text.length <= 140) return text || "No copy saved yet.";
  return `${text.slice(0, 137)}…`;
}

type ScheduledPromotionsListProps = {
  statusFilter?: Promotion["status"] | "all";
  emptySuffix?: string;
};

export function ScheduledPromotionsList({
  statusFilter = "all",
  emptySuffix = "and save your first draft or scheduled post on the Create page.",
}: ScheduledPromotionsListProps) {
  const [items, setItems] = useState<Promotion[]>([]);
  const [mounted, setMounted] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const result = readPromotions();
    setStorageWarning(result.warning ?? null);
    const next =
      statusFilter === "all"
        ? result.items
        : result.items.filter((item) => item.status === statusFilter);
    setItems([...next].reverse());
  }, [statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount flag is intentional for first-client-render skeleton
    setMounted(true);
    refresh();
  }, [refresh]);

  const handleRemove = (id: string) => {
    setRemoveError(null);
    try {
      removePromotionById(id);
      refresh();
    } catch {
      setRemoveError("Could not remove this promotion. Please try again.");
    }
  };

  if (!mounted) {
    return (
      <ul className="space-y-3" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={`scheduled-skeleton-${i}`}
            className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-start"
          >
            <div className="mx-auto aspect-square w-16 shrink-0 rounded-md bg-zinc-100 dark:bg-zinc-800 sm:mx-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="h-4 w-40 rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-5 w-20 rounded-full bg-zinc-100 dark:bg-zinc-800" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <div className="h-5 w-20 rounded-md bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-5 w-20 rounded-md bg-zinc-100 dark:bg-zinc-800" />
              </div>
              <div className="h-3 w-44 rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-4 w-full rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-4 w-5/6 rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
            <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-stretch">
              <div className="h-9 w-20 rounded-md bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-9 w-20 rounded-md bg-zinc-100 dark:bg-zinc-800" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-950">
        {storageWarning ? (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {storageWarning}
          </p>
        ) : null}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No drafts yet. Start in{" "}
          <Link href="/products" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
            Products
          </Link>{" "}
          {emptySuffix}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {storageWarning ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {storageWarning}
        </p>
      ) : null}
      {removeError ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {removeError}
        </p>
      ) : null}
      <ul className="space-y-3">
      {items.map((p) => (
        <li
          key={p.id}
          className="promi-card-lift flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 transition-[box-shadow,transform,border-color] duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-zinc-300 motion-safe:hover:shadow-md motion-safe:hover:shadow-zinc-900/[0.06] dark:border-zinc-800 dark:bg-zinc-950 dark:motion-safe:hover:border-zinc-600 dark:motion-safe:hover:shadow-black/35 sm:flex-row sm:items-start"
        >
          <div className="relative mx-auto aspect-square w-16 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800 sm:mx-0">
            <Image
              src={p.productImage}
              alt={p.productName}
              fill
              className="object-cover"
              sizes="64px"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{p.productName}</h2>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  p.status === "scheduled"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {statusLabel(p.status)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.channels.map((ch) => (
                <span
                  key={ch}
                  className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                >
                  {channelLabel(ch)}
                </span>
              ))}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-600 dark:text-zinc-300">When: </span>
              {formatScheduledAt(p.scheduledAt)}
            </p>
            <p className="line-clamp-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {contentPreview(p)}
            </p>
          </div>
          <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-stretch">
            <Link
              href={`/create?productId=${encodeURIComponent(p.productId)}&promotionId=${encodeURIComponent(p.id)}`}
              className="promi-press inline-flex flex-1 items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium text-zinc-900 transition-[background-color,box-shadow,transform,border-color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-50 hover:shadow-sm hover:shadow-zinc-900/[0.04] active:scale-[0.98] motion-safe:active:translate-y-px dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 dark:hover:shadow-black/30 sm:flex-none"
            >
              View
            </Link>
            <button
              type="button"
              onClick={() => handleRemove(p.id)}
              className="promi-press inline-flex flex-1 items-center justify-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-red-200/80 hover:bg-red-50 hover:text-red-700 hover:shadow-sm hover:shadow-red-900/5 active:scale-[0.98] motion-safe:active:translate-y-px dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-900/50 dark:hover:bg-red-950/40 dark:hover:text-red-300 sm:flex-none"
            >
              Remove
            </button>
          </div>
        </li>
      ))}
      </ul>
    </div>
  );
}

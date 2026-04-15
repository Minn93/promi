"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type ScheduledPost = {
  id: string;
  productName: string;
  imageUrl: string | null;
  channels: unknown;
  contentPayload: unknown;
  scheduledAt: string;
  status: "scheduled" | "processing" | "published" | "failed" | "cancelled";
  lastError: string | null;
};

const REFRESH_EVENT = "promi:scheduled-posts-updated";
const POLL_INTERVAL_MS = 5000;
const OVERDUE_TICK_MS = 1000;

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatScheduledAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return dateTimeFormatter.format(d);
}

function channelLabel(id: string): string {
  if (id === "instagram") return "Instagram";
  if (id === "pinterest") return "Pinterest";
  return id;
}

function readChannels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

function readPreview(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "No copy saved yet.";
  const payload = raw as Record<string, unknown>;
  const text = [
    String(payload.instagramCaption ?? "").trim(),
    String(payload.pinterestTitle ?? "").trim(),
    String(payload.pinterestDescription ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "No copy saved yet.";
  return text.length <= 140 ? text : `${text.slice(0, 137)}…`;
}

function statusClassName(status: ScheduledPost["status"], isOverdue: boolean): string {
  if (isOverdue) return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  if (status === "scheduled") return "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
  if (status === "processing") return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  if (status === "published") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "failed") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function statusLabel(status: ScheduledPost["status"], isOverdue: boolean): string {
  if (isOverdue) return "Processing...";
  if (status === "scheduled") return "Scheduled";
  if (status === "processing") return "Processing";
  if (status === "published") return "Published";
  if (status === "failed") return "Failed";
  return "Cancelled";
}

export function ServerScheduledPostsList() {
  const [items, setItems] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/scheduled-posts?status=scheduled&limit=100", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { data?: ScheduledPost[]; error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Could not load scheduled posts.");
        return;
      }
      setItems(Array.isArray(body?.data) ? body.data : []);
    } catch {
      setError("Could not load scheduled posts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    const onFocus = () => {
      void refresh();
    };
    const onUpdated = () => {
      void refresh();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener(REFRESH_EVENT, onUpdated);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(REFRESH_EVENT, onUpdated);
    };
  }, [refresh]);

  useEffect(() => {
    const tickId = window.setInterval(() => {
      setNowMs(Date.now());
    }, OVERDUE_TICK_MS);
    return () => window.clearInterval(tickId);
  }, []);

  const handleCancel = async (id: string) => {
    setActionError(null);
    setCancellingId(id);
    try {
      const res = await fetch(`/api/scheduled-posts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Cancelled by user." }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setActionError(body?.error ?? "Could not cancel this scheduled post.");
        return;
      }
      await refresh();
    } catch {
      setActionError("Could not cancel this scheduled post.");
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading scheduled posts...</p>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-950">
        {error ? (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No scheduled posts yet. New scheduled posts will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {actionError}
        </p>
      ) : null}
      <ul className="space-y-3">
        {items.map((p) => (
          (() => {
            const scheduledAtMs = new Date(p.scheduledAt).getTime();
            const isOverdue = Number.isFinite(scheduledAtMs) && p.status === "scheduled" && scheduledAtMs <= nowMs;
            return (
          <li
            key={p.id}
            className="promi-card-lift flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 transition-[box-shadow,transform,border-color] duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-start"
          >
            <div className="relative mx-auto aspect-square w-16 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800 sm:mx-0">
              {p.imageUrl ? (
                <Image src={p.imageUrl} alt={p.productName} fill className="object-cover" sizes="64px" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{p.productName}</h2>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClassName(p.status, isOverdue)}`}>
                  {statusLabel(p.status, isOverdue)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {readChannels(p.channels).map((ch) => (
                  <span
                    key={`${p.id}-${ch}`}
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
                {readPreview(p.contentPayload)}
              </p>
              {p.lastError ? <p className="text-xs text-red-600 dark:text-red-400">{p.lastError}</p> : null}
            </div>
            <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-stretch">
              <button
                type="button"
                onClick={() => void handleCancel(p.id)}
                disabled={cancellingId === p.id || p.status === "cancelled" || p.status === "published" || isOverdue}
                className="promi-press inline-flex flex-1 items-center justify-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-red-200/80 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-900/50 dark:hover:bg-red-950/40 dark:hover:text-red-300 sm:flex-none"
              >
                {cancellingId === p.id ? "Cancelling..." : "Cancel"}
              </button>
            </div>
          </li>
            );
          })()
        ))}
      </ul>
    </div>
  );
}

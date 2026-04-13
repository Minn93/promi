"use client";

import { useEffect, useState } from "react";

type PostHistoryItem = {
  id: string;
  scheduledPostId: string;
  eventType: "scheduled" | "picked_up" | "published" | "failed" | "cancelled" | "retried";
  channel: string | null;
  message: string | null;
  createdAt: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown time";
  return dateTimeFormatter.format(d);
}

export function PostHistoryList() {
  const [items, setItems] = useState<PostHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setError(null);
      try {
        const res = await fetch("/api/post-history?limit=200", { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { data?: PostHistoryItem[]; error?: string } | null;
        if (!res.ok) {
          setError(body?.error ?? "Could not load post history.");
          return;
        }
        setItems(Array.isArray(body?.data) ? body.data : []);
      } catch {
        setError("Could not load post history.");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading post history...</p>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-950">
        {error ? (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No post history on the server yet.</p>
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
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="font-medium capitalize text-zinc-900 dark:text-zinc-50">{item.eventType.replace("_", " ")}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatAt(item.createdAt)}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Post ID: {item.scheduledPostId}</p>
            {item.channel ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Channel: {item.channel}</p>
            ) : null}
            {item.message ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{item.message}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

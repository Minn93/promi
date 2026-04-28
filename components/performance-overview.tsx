"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readPromotions } from "@/lib/promotions-storage";
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

function formatChannels(channels: string[]): string {
  if (channels.length === 0) return "None";
  return channels.map(channelLabel).join(", ");
}

function topProductName(promotions: Promotion[]): string {
  if (promotions.length === 0) return "—";
  const counts = new Map<string, { name: string; n: number }>();
  for (const p of promotions) {
    const cur = counts.get(p.productId) ?? { name: p.productName, n: 0 };
    cur.n += 1;
    counts.set(p.productId, cur);
  }
  let bestName = "";
  let bestN = 0;
  for (const { name, n } of counts.values()) {
    if (n > bestN) {
      bestN = n;
      bestName = name;
    }
  }
  return bestN > 0 ? bestName : "—";
}

function channelCounts(promotions: Promotion[]) {
  let instagram = 0;
  let pinterest = 0;
  for (const p of promotions) {
    if (p.channels.includes("instagram")) instagram += 1;
    if (p.channels.includes("pinterest")) pinterest += 1;
  }
  return { instagram, pinterest };
}

/** 2–3 short tips based on saved `Promotion` rows. */
function nextStepSuggestions(promotions: Promotion[]): string[] {
  if (promotions.length === 0) {
    return ["Save your first promotion on the Create page to see helpful tips here."];
  }

  const drafts = promotions.filter((p) => p.status === "draft").length;
  const scheduled = promotions.filter((p) => p.status === "scheduled").length;
  const top = topProductName(promotions);
  const { instagram: ig, pinterest: pin } = channelCounts(promotions);

  const tips: string[] = [];

  if (scheduled === 0) {
    tips.push("You have not scheduled any promotions yet.");
  }
  if (drafts >= 1) {
    tips.push(
      `You have ${drafts} draft promotion${drafts === 1 ? "" : "s"} ready to schedule.`,
    );
  }
  if (top !== "—") {
    tips.push(`Your top product is ${top}.`);
  }
  if (pin > ig && pin > 0) {
    tips.push("Pinterest is currently your most-used channel.");
  } else if (ig > pin && ig > 0) {
    tips.push("Instagram is currently your most-used channel.");
  }

  const unique = [...new Set(tips)];
  if (unique.length <= 3) return unique;

  return unique.slice(0, 3);
}

function KpiCard({
  label,
  value,
  hint,
  valueSize = "number",
}: {
  label: string;
  value: string | number;
  hint?: string;
  valueSize?: "number" | "text";
}) {
  return (
    <div
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      role="group"
      aria-label={`${label}: ${String(value)}${hint ? `. ${hint}` : ""}`}
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p
        className={`mt-1 font-semibold text-zinc-900 dark:text-zinc-50 ${
          valueSize === "number"
            ? "text-2xl tabular-nums"
            : "line-clamp-2 text-base leading-snug"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}

export function PerformanceOverview() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [mounted, setMounted] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setMounted(true);
      const result = readPromotions();
      setStorageWarning(result.warning ?? null);
      setPromotions(result.items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const total = promotions.length;
    const scheduled = promotions.filter((p) => p.status === "scheduled").length;
    const draft = promotions.filter((p) => p.status === "draft").length;
    const top = topProductName(promotions);
    const channels = channelCounts(promotions);
    const recent = [...promotions].reverse().slice(0, 5);
    const suggestions = nextStepSuggestions(promotions);
    return { total, scheduled, draft, top, channels, recent, suggestions };
  }, [promotions]);

  if (!mounted) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">
        Loading...
      </p>
    );
  }

  if (promotions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-950">
        {storageWarning ? (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {storageWarning}
          </p>
        ) : null}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No promotion data yet. Go to{" "}
          <Link href="/products" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
            Products
          </Link>{" "}
          and create a promotion, then save it as a draft or schedule it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="performance-overview-heading" className="space-y-3">
        <h2 id="performance-overview-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Overview</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total promotions" value={stats.total} />
          <KpiCard label="Scheduled" value={stats.scheduled} />
          <KpiCard label="Drafts" value={stats.draft} />
          <KpiCard
            label="Top product"
            value={stats.top}
            valueSize="text"
            hint={stats.total > 0 ? "Most saves in this list" : undefined}
          />
        </div>
      </section>

      <section aria-labelledby="performance-channel-breakdown-heading" className="space-y-3">
        <h2 id="performance-channel-breakdown-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Channel breakdown</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Number of saved promotions that include each channel (one promotion can include both).
        </p>
        <div className="flex flex-wrap gap-6 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <span className="text-zinc-700 dark:text-zinc-300">
            <span className="font-medium text-zinc-900 dark:text-zinc-50">Instagram</span> —{" "}
            {stats.channels.instagram}
          </span>
          <span className="text-zinc-700 dark:text-zinc-300">
            <span className="font-medium text-zinc-900 dark:text-zinc-50">Pinterest</span> —{" "}
            {stats.channels.pinterest}
          </span>
        </div>
      </section>

      <section aria-labelledby="performance-recent-promotions-heading" className="space-y-3">
        <h2 id="performance-recent-promotions-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent promotions</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Your 5 most recently saved promotions.</p>
        {stats.recent.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No promotions saved yet.</p>
        ) : (
          <ul className="space-y-2">
            {stats.recent.map((p: Promotion) => (
              <li
                key={p.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <p className="sr-only">
                  Promotion summary: {p.productName}. Status {p.status === "scheduled" ? "Scheduled" : "Draft"}. Channels {formatChannels(p.channels)}. Scheduled for {formatScheduledAt(p.scheduledAt)}.
                </p>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{p.productName}</p>
                <dl className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-zinc-500 dark:text-zinc-500">Status</dt>
                    <dd>{p.status === "scheduled" ? "Scheduled" : "Draft"}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-zinc-500 dark:text-zinc-500">Channels</dt>
                    <dd>{formatChannels(p.channels)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-zinc-500 dark:text-zinc-500">Scheduled for</dt>
                    <dd>{formatScheduledAt(p.scheduledAt)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="performance-next-steps-heading" className="space-y-3">
        <h2 id="performance-next-steps-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Suggested next steps</h2>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
          {storageWarning ? (
            <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {storageWarning}
            </p>
          ) : null}
          <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {stats.suggestions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Based on promotions in this browser. Open{" "}
            <Link href="/scheduled" className="font-medium underline underline-offset-2">
              Scheduled queue
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}

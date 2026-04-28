import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { prisma } from "@/lib/prisma";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { getPlanTierForOwner } from "@/src/lib/plans/server";

export const dynamic = "force-dynamic";

type Platform = "x" | "instagram" | "facebook";

type RawResponseObject = Record<string, unknown>;

function asObject(v: unknown): RawResponseObject | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as RawResponseObject;
}

function getByPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    const rec = asObject(cur);
    if (!rec) return undefined;
    cur = rec[key];
  }
  return cur;
}

function asNonNegativeInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return null;
}

function parseMetrics(raw: unknown): { views: number | null; likes: number | null; comments: number | null; shares: number | null } {
  const views =
    asNonNegativeInt(getByPath(raw, ["data", "public_metrics", "impression_count"]))
    ?? asNonNegativeInt(getByPath(raw, ["public_metrics", "impression_count"]))
    ?? asNonNegativeInt(getByPath(raw, ["views"]))
    ?? asNonNegativeInt(getByPath(raw, ["impressions"]));
  const likes =
    asNonNegativeInt(getByPath(raw, ["data", "public_metrics", "like_count"]))
    ?? asNonNegativeInt(getByPath(raw, ["public_metrics", "like_count"]))
    ?? asNonNegativeInt(getByPath(raw, ["likes"]));
  const comments =
    asNonNegativeInt(getByPath(raw, ["data", "public_metrics", "reply_count"]))
    ?? asNonNegativeInt(getByPath(raw, ["public_metrics", "reply_count"]))
    ?? asNonNegativeInt(getByPath(raw, ["comments"]));
  const shares =
    asNonNegativeInt(getByPath(raw, ["data", "public_metrics", "retweet_count"]))
    ?? asNonNegativeInt(getByPath(raw, ["public_metrics", "retweet_count"]))
    ?? asNonNegativeInt(getByPath(raw, ["shares"]));
  return { views, likes, comments, shares };
}

function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fallbackMetrics(seedInput: string): { views: number; likes: number; comments: number; shares: number } {
  const seed = stableHash(seedInput);
  const views = 120 + (seed % 2400);
  const likes = Math.max(0, Math.floor(views * (0.03 + (seed % 9) / 100)));
  const comments = Math.max(0, Math.floor(views * (0.004 + (seed % 5) / 1000)));
  const shares = Math.max(0, Math.floor(views * (0.002 + (seed % 4) / 1000)));
  return { views, likes, comments, shares };
}

function extractPreview(contentPayload: unknown): string {
  const payload = asObject(contentPayload);
  if (!payload) return "No preview available.";
  const text = [
    String(payload.instagramCaption ?? "").trim(),
    String(payload.pinterestTitle ?? "").trim(),
    String(payload.pinterestDescription ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "No preview available.";
  return text.length <= 140 ? text : `${text.slice(0, 137)}...`;
}

export default async function AnalyticsPage() {
  const planTier = getPlanTierForOwner(getCurrentOwnerId());
  const rows = await prisma.scheduledPost.findMany({
    where: {
      status: "published",
      publishedAt: { not: null },
    },
    orderBy: { publishedAt: "desc" },
    take: 500,
    select: {
      id: true,
      platform: true,
      contentPayload: true,
      publishedAt: true,
      attempts: {
        where: { status: "success" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { rawResponse: true },
      },
    },
  });

  const { analyticsRows, usesFallbackMetrics } = rows
    .filter((row) => row.publishedAt)
    .reduce<{
      analyticsRows: Array<{
        id: string;
        platform: Platform;
        publishedAt: string;
        preview: string;
        views: number;
        likes: number;
        comments: number;
        shares: number;
      }>;
      usesFallbackMetrics: boolean;
    }>(
      (acc, row) => {
        const parsed = parseMetrics(row.attempts[0]?.rawResponse ?? null);
        const needFallback =
          parsed.views == null || parsed.likes == null || parsed.comments == null || parsed.shares == null;
        const fallback = fallbackMetrics(row.id);
        acc.analyticsRows.push({
          id: row.id,
          platform: row.platform as Platform,
          publishedAt: row.publishedAt!.toISOString(),
          preview: extractPreview(row.contentPayload),
          views: parsed.views ?? fallback.views,
          likes: parsed.likes ?? fallback.likes,
          comments: parsed.comments ?? fallback.comments,
          shares: parsed.shares ?? fallback.shares,
        });
        return {
          analyticsRows: acc.analyticsRows,
          usesFallbackMetrics: acc.usesFallbackMetrics || needFallback,
        };
      },
      { analyticsRows: [], usesFallbackMetrics: false },
    );

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Simple post performance analytics from published posts and history data."
      />
      <Suspense fallback={<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading analytics...</p>}>
        <AnalyticsDashboard rows={analyticsRows} usesFallbackMetrics={usesFallbackMetrics} planTier={planTier} />
      </Suspense>
    </>
  );
}

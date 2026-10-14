import { Suspense } from "react";
import { AccountUnavailableState } from "@/components/account-unavailable-state";
import { PageHeader } from "@/components/page-header";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { prisma } from "@/lib/prisma";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { checkOwnerAccountGates } from "@/src/lib/auth/user-status";
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
  const ownerId = await getCurrentOwnerId();
  const policyGate = await checkOwnerAccountGates(ownerId, { requireVerifiedEmail: false });
  if (policyGate) {
    return (
      <>
        <PageHeader
          title="Analytics"
          description="Simple post performance analytics from published posts and history data."
        />
        <AccountUnavailableState
          title="Account unavailable"
          description="Analytics requires an active account."
        />
      </>
    );
  }
  const planTier = await getPlanTierForOwner(ownerId);
  const rows = await prisma.scheduledPost.findMany({
    where: {
      ownerId,
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
        where: { status: "success", ownerId },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { rawResponse: true },
      },
    },
  });

  const analyticsRows = rows
    .filter((row) => row.publishedAt)
    .map((row) => {
      const parsed = parseMetrics(row.attempts[0]?.rawResponse ?? null);
      return {
        id: row.id,
        platform: row.platform as Platform,
        publishedAt: row.publishedAt!.toISOString(),
        preview: extractPreview(row.contentPayload),
        views: parsed.views,
        likes: parsed.likes,
        comments: parsed.comments,
        shares: parsed.shares,
      };
    });

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Simple post performance analytics from published posts and history data."
      />
      <Suspense fallback={<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading analytics…</p>}>
        <AnalyticsDashboard rows={analyticsRows} planTier={planTier} />
      </Suspense>
    </>
  );
}

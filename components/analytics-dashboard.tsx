"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { publishPlatformBadgeLabel } from "@/lib/publish-platform-copy";
import { saveReusableTemplateFromScheduledPostId } from "@/lib/reusable-post-templates-storage";
import { getPlanConfig, hasPlanFeature, limitLabel, type PlanTier } from "@/src/lib/plans/config";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Platform = "x" | "instagram" | "facebook";
type DateRange = "7d" | "30d" | "90d" | "all";
type SortBy = "latest" | "views" | "engagement";
type PlatformFilter = "all" | Platform;
type ViewMode = "table" | "cards";
type MetricKey = "views" | "likes" | "comments" | "shares" | "engagement";
type CountMetricKey = Exclude<MetricKey, "engagement">;
/** `null` means the platform did not report this metric; never substitute a synthetic value. */
type Metric = number | null;

type AnalyticsRow = {
  id: string;
  platform: Platform;
  publishedAt: string;
  preview: string;
  views: Metric;
  likes: Metric;
  comments: Metric;
  shares: Metric;
};

type MetricSum = { total: number; known: number };

type AnalyticsDashboardProps = {
  rows: AnalyticsRow[];
  planTier: PlanTier;
};

const DEFAULT_RANGE: DateRange = "30d";
const DEFAULT_SORT: SortBy = "latest";

function parseRange(value: string | null): DateRange {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") return value;
  return DEFAULT_RANGE;
}

function parseSort(value: string | null): SortBy {
  if (value === "latest" || value === "views" || value === "engagement") return value;
  return DEFAULT_SORT;
}

function parsePlatformFilter(value: string | null): PlatformFilter {
  if (value === "x" || value === "instagram" || value === "facebook" || value === "all") return value;
  return "all";
}

function platformLabel(platform: Platform): string {
  return publishPlatformBadgeLabel(platform);
}

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function clampInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function toNumericValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (Array.isArray(value) && value.length > 0) {
    return toNumericValue(value[0]);
  }
  return 0;
}

function hasAnyMetric(item: Pick<AnalyticsRow, CountMetricKey>): boolean {
  return item.views != null || item.likes != null || item.comments != null || item.shares != null;
}

function hasAllMetrics(item: Pick<AnalyticsRow, CountMetricKey>): boolean {
  return item.views != null && item.likes != null && item.comments != null && item.shares != null;
}

/** Only computed when every count metric was reported; partial data would distort the rate. */
function engagementRate(item: Pick<AnalyticsRow, CountMetricKey>): number | null {
  if (item.views == null || item.likes == null || item.comments == null || item.shares == null) return null;
  if (item.views <= 0) return 0;
  return (item.likes + item.comments + item.shares) / item.views;
}

function sumMetric(items: Array<Pick<AnalyticsRow, CountMetricKey>>, key: CountMetricKey): MetricSum {
  return items.reduce<MetricSum>(
    (acc, item) => {
      const value = item[key];
      if (value == null) return acc;
      return { total: acc.total + clampInt(value), known: acc.known + 1 };
    },
    { total: 0, known: 0 },
  );
}

function averageOf(sum: MetricSum): number {
  return sum.known > 0 ? sum.total / sum.known : 0;
}

function compareNullableDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function formatMetric(value: Metric): string {
  return value == null ? "—" : clampInt(value).toLocaleString();
}

function formatSum(sum: MetricSum): string {
  return sum.known === 0 ? "—" : sum.total.toLocaleString();
}

function spokenMetric(value: Metric, label: string): string {
  return value == null ? `${label} not available` : `${clampInt(value).toLocaleString()} ${label}`;
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function formatRate(rate: number | null): string {
  return rate == null ? "—" : percent(rate);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

function clampPreview(value: string, max = 56): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 3)}...`;
}

function toPercentDelta(value: number, average: number): number {
  if (average <= 0) return 0;
  return ((value - average) / average) * 100;
}

function formatDeltaSentence(deltaPct: number, label: string): string {
  if (Math.abs(deltaPct) < 0.1) return `About average ${label}`;
  if (deltaPct > 0) return `+${deltaPct.toFixed(0)}% above average ${label}`;
  return `${deltaPct.toFixed(0)}% below average ${label}`;
}

function rankingLabel(percentile: number): string {
  if (percentile >= 0.9) return "Top 10%";
  if (percentile >= 0.7) return "Above average";
  if (percentile >= 0.4) return "Average";
  return "Below average";
}

function badgeLabel(percentile: number): "high" | "medium" | "low" {
  if (percentile >= 0.67) return "high";
  if (percentile >= 0.34) return "medium";
  return "low";
}

function withinRange(iso: string, range: DateRange): boolean {
  if (range === "all") return true;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return false;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  return ms >= threshold;
}

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      role="group"
      aria-label={`${label}: ${String(value)}${hint ? `. ${hint}` : ""}`}
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}

export function AnalyticsDashboard({ rows, planTier }: AnalyticsDashboardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasAdvancedAnalytics = hasPlanFeature(planTier, "advancedAnalytics");
  const plan = getPlanConfig(planTier);

  const rawDateRange = parseRange(searchParams.get("range"));
  const dateRange =
    !hasAdvancedAnalytics && (rawDateRange === "90d" || rawDateRange === "all")
      ? "30d"
      : rawDateRange;
  const sortBy = parseSort(searchParams.get("sort"));
  const platformFilter = parsePlatformFilter(searchParams.get("platform"));
  const query = (searchParams.get("q") ?? "").trim();
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);

  // Narrow screens default to cards; desktop keeps table. No persisted preference.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    if (!mq.matches) return;
    const timeoutId = window.setTimeout(() => setViewMode("cards"), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const updateQuery = useCallback((next: { range?: DateRange; sort?: SortBy; platform?: PlatformFilter; q?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    const range = next.range ?? parseRange(params.get("range"));
    const sort = next.sort ?? parseSort(params.get("sort"));
    const platform = next.platform ?? parsePlatformFilter(params.get("platform"));
    const q = next.q ?? params.get("q") ?? "";
    params.set("range", range);
    params.set("sort", sort);
    params.set("platform", platform);
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  const filtered = useMemo(() => {
    const queryLower = query.toLowerCase();
    const base = rows
      .filter((row) => withinRange(row.publishedAt, dateRange))
      .filter((row) => (platformFilter === "all" ? true : row.platform === platformFilter))
      .filter((row) => {
        if (!queryLower) return true;
        return [row.id, platformLabel(row.platform), row.preview].join(" ").toLowerCase().includes(queryLower);
      });
    return [...base].sort((a, b) => {
      if (sortBy === "latest") {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      if (sortBy === "views") {
        return compareNullableDesc(a.views, b.views);
      }
      return compareNullableDesc(engagementRate(a), engagementRate(b));
    });
  }, [rows, dateRange, sortBy, platformFilter, query]);

  const hasAnyMetrics = useMemo(() => filtered.some(hasAnyMetric), [filtered]);

  const missingMetricsNotice = useMemo(() => {
    const missing = rows.filter((row) => !hasAllMetrics(row));
    if (missing.length === 0) return null;
    const platforms = [...new Set(missing.map((row) => platformLabel(row.platform)))].join(" or ");
    const scope = missing.length === rows.length ? "these posts" : "some posts";
    return `Engagement metrics aren't available from ${platforms} for ${scope} yet. Missing values show as — and aren't counted in totals.`;
  }, [rows]);

  const totals = useMemo(() => {
    const totalPosts = filtered.length;
    const complete = filtered.filter(hasAllMetrics);
    const completeViews = sumMetric(complete, "views").total;
    const completeInteractions =
      sumMetric(complete, "likes").total + sumMetric(complete, "comments").total + sumMetric(complete, "shares").total;
    const avgEngagementRate =
      complete.length === 0 ? null : completeViews > 0 ? completeInteractions / completeViews : 0;
    return {
      totalPosts,
      views: sumMetric(filtered, "views"),
      likes: sumMetric(filtered, "likes"),
      comments: sumMetric(filtered, "comments"),
      shares: sumMetric(filtered, "shares"),
      avgEngagementRate,
      completePosts: complete.length,
    };
  }, [filtered]);

  const platformRows = useMemo(() => {
    return (["x", "instagram", "facebook"] as Platform[])
      .map((platform) => {
        const items = filtered.filter((row) => row.platform === platform);
        const complete = items.filter(hasAllMetrics);
        const completeViews = sumMetric(complete, "views").total;
        const completeInteractions =
          sumMetric(complete, "likes").total + sumMetric(complete, "comments").total + sumMetric(complete, "shares").total;
        const rate = complete.length === 0 ? null : completeViews > 0 ? completeInteractions / completeViews : 0;
        return {
          platform,
          posts: items.length,
          views: sumMetric(items, "views"),
          likes: sumMetric(items, "likes"),
          engagementRate: rate,
        };
      })
      .filter((item) => item.posts > 0);
  }, [filtered]);

  const timeSeriesRows = useMemo(() => {
    const daily = new Map<string, { views: MetricSum; completeViews: number; interactions: number; completePosts: number; dateMs: number }>();
    for (const row of filtered) {
      const date = new Date(row.publishedAt);
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dateKey = dateOnly.toISOString().slice(0, 10);
      const current = daily.get(dateKey) ?? {
        views: { total: 0, known: 0 },
        completeViews: 0,
        interactions: 0,
        completePosts: 0,
        dateMs: dateOnly.getTime(),
      };
      if (row.views != null) {
        current.views = { total: current.views.total + clampInt(row.views), known: current.views.known + 1 };
      }
      if (hasAllMetrics(row)) {
        current.completeViews += clampInt(row.views ?? 0);
        current.interactions += clampInt(row.likes ?? 0) + clampInt(row.comments ?? 0) + clampInt(row.shares ?? 0);
        current.completePosts += 1;
      }
      daily.set(dateKey, current);
    }
    return [...daily.entries()]
      .sort((a, b) => a[1].dateMs - b[1].dateMs)
      .map(([dateKey, value]) => ({
        dateKey,
        label: shortDate(dateKey),
        views: value.views.known > 0 ? value.views.total : null,
        engagementRatePct:
          value.completePosts === 0 ? null : value.completeViews > 0 ? (value.interactions / value.completeViews) * 100 : 0,
      }));
  }, [filtered]);

  const platformChartRows = useMemo(
    () =>
      platformRows.map((row) => ({
        platform: platformLabel(row.platform),
        views: row.views.known > 0 ? row.views.total : null,
        engagementRatePct: row.engagementRate == null ? null : Number((row.engagementRate * 100).toFixed(2)),
      })),
    [platformRows],
  );

  const topPostsChartRows = useMemo(
    () =>
      filtered
        .filter((row) => row.views != null)
        .sort((a, b) => compareNullableDesc(a.views, b.views))
        .slice(0, 5)
        .map((row) => ({
          id: row.id,
          label: `${platformLabel(row.platform)} - ${clampPreview(row.preview, 42)}`,
          views: row.views,
        })),
    [filtered],
  );

  const postDetails = useMemo(() => {
    if (filtered.length === 0) return [];

    const complete = filtered.filter(hasAllMetrics);
    const completeCount = complete.length;
    const avgViews = averageOf(totals.views);
    const avgLikes = averageOf(totals.likes);
    const avgComments = averageOf(totals.comments);
    const avgShares = averageOf(totals.shares);
    const avgEngagement = totals.avgEngagementRate ?? 0;

    const maxViews = Math.max(...complete.map((row) => clampInt(row.views ?? 0)), 1);
    const maxEngagement = Math.max(...complete.map((row) => engagementRate(row) ?? 0), 0.0001);

    const scoreById = new Map(
      complete.map((row) => {
        const normalizedViews = clampInt(row.views ?? 0) / maxViews;
        const normalizedEngagement = (engagementRate(row) ?? 0) / maxEngagement;
        const score = normalizedEngagement * 0.55 + normalizedViews * 0.45;
        return [row.id, score] as const;
      }),
    );

    const rankedIds = [...complete]
      .sort((a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0))
      .map((row) => row.id);

    const engagementRankedIds = [...complete]
      .sort((a, b) => compareNullableDesc(engagementRate(a), engagementRate(b)))
      .map((row) => row.id);

    const rankMap = new Map(rankedIds.map((id, idx) => [id, idx]));
    const engagementRankMap = new Map(engagementRankedIds.map((id, idx) => [id, idx]));

    return filtered.map((row) => {
      const rowEngagementRate = engagementRate(row);
      if (rowEngagementRate == null) {
        return {
          ...row,
          rowEngagementRate,
          badge: null,
          rank: null,
          viewsDeltaPct: null,
          engagementDeltaPct: null,
          bestMetric: null,
        };
      }
      const rankIndex = rankMap.get(row.id) ?? completeCount - 1;
      const engagementRankIndex = engagementRankMap.get(row.id) ?? completeCount - 1;
      const percentile = completeCount === 1 ? 1 : 1 - rankIndex / (completeCount - 1);
      const engagementPercentile = completeCount === 1 ? 1 : 1 - engagementRankIndex / (completeCount - 1);

      const metricDeltas: Record<MetricKey, number> = {
        views: toPercentDelta(clampInt(row.views ?? 0), avgViews),
        likes: toPercentDelta(clampInt(row.likes ?? 0), avgLikes),
        comments: toPercentDelta(clampInt(row.comments ?? 0), avgComments),
        shares: toPercentDelta(clampInt(row.shares ?? 0), avgShares),
        engagement: toPercentDelta(rowEngagementRate, avgEngagement),
      };

      const bestMetric = (Object.entries(metricDeltas) as Array<[MetricKey, number]>).reduce<{
        key: MetricKey;
        delta: number;
      } | null>((best, [key, delta]) => {
        if (delta <= 0) return best;
        if (!best || delta > best.delta) return { key, delta };
        return best;
      }, null);

      return {
        ...row,
        rowEngagementRate,
        badge: badgeLabel(engagementPercentile),
        rank: rankingLabel(percentile),
        viewsDeltaPct: metricDeltas.views,
        engagementDeltaPct: metricDeltas.engagement,
        bestMetric,
      };
    });
  }, [filtered, totals]);

  const insights = useMemo(() => {
    if (filtered.length === 0) {
      return ["No published posts found for this date range yet."];
    }

    const postCountLine = `You published ${totals.totalPosts.toLocaleString()} posts in this period.`;
    if (!hasAnyMetrics) {
      return [postCountLine, "Engagement insights appear once the platform reports metrics for these posts."];
    }

    const topByEngagement = platformRows
      .filter((row) => row.engagementRate != null)
      .reduce<(typeof platformRows)[number] | null>(
        (best, row) => (!best || (row.engagementRate ?? 0) > (best.engagementRate ?? 0) ? row : best),
        null,
      );

    const topByViews = platformRows
      .filter((row) => row.views.known > 0)
      .reduce<(typeof platformRows)[number] | null>(
        (best, row) => (!best || row.views.total > best.views.total ? row : best),
        null,
      );

    const bestPost = filtered
      .filter((row) => row.views != null)
      .reduce<AnalyticsRow | null>(
        (best, row) => (!best || (row.views ?? 0) > (best.views ?? 0) ? row : best),
        null,
      );

    const lines: string[] = [];
    if (topByEngagement) {
      lines.push(`${platformLabel(topByEngagement.platform)} has the highest engagement rate in this range.`);
    }
    if (topByViews) {
      lines.push(`${platformLabel(topByViews.platform)} has the most views in this range.`);
    }
    if (bestPost) {
      lines.push(`Your top post reached ${formatMetric(bestPost.views)} views.`);
    }
    lines.push(postCountLine);
    if (totals.avgEngagementRate != null) {
      lines.push(`Average engagement rate is ${percent(totals.avgEngagementRate)}.`);
    }
    return lines;
  }, [filtered, hasAnyMetrics, platformRows, totals.totalPosts, totals.avgEngagementRate]);

  const kpiHint = (sum: MetricSum): string | undefined => {
    if (sum.known === 0) return totals.totalPosts > 0 ? "Not available yet" : undefined;
    if (sum.known < totals.totalPosts) return `From ${sum.known.toLocaleString()} of ${totals.totalPosts.toLocaleString()} posts`;
    return undefined;
  };

  const handleSaveTemplate = useCallback(async (scheduledPostId: string) => {
    setTemplateNotice(null);
    setSavedTemplateId(null);
    setSavingTemplateId(scheduledPostId);
    const result = await saveReusableTemplateFromScheduledPostId(scheduledPostId);
    if (result.error) {
      setTemplateNotice(result.error);
      setSavingTemplateId(null);
      return;
    }
    setSavedTemplateId(result.template?.id ?? null);
    setTemplateNotice(`Template saved: ${result.template?.name ?? "Reusable template"}`);
    setSavingTemplateId(null);
  }, []);

  return (
    <section aria-label="Analytics dashboard panels" className="space-y-6">
      <fieldset className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <legend className="sr-only">Analytics filters</legend>
        <input
          type="search"
          value={query}
          onChange={(e) => updateQuery({ q: e.target.value })}
          placeholder="Search preview or post ID"
          className="w-full min-w-0 rounded-md sm:w-auto sm:min-w-[220px] sm:flex-1 border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-500"
          aria-label="Search analytics posts"
        />
        <select
          value={dateRange}
          onChange={(e) => updateQuery({ range: parseRange(e.target.value) })}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          aria-label="Date range filter"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d" disabled={!hasAdvancedAnalytics}>Last 90 days{!hasAdvancedAnalytics ? " (Pro)" : ""}</option>
          <option value="all" disabled={!hasAdvancedAnalytics}>All time{!hasAdvancedAnalytics ? " (Pro)" : ""}</option>
        </select>
        <select
          value={platformFilter}
          onChange={(e) => updateQuery({ platform: parsePlatformFilter(e.target.value) })}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          aria-label="Platform filter"
        >
          <option value="all">All platforms</option>
          <option value="x">X</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => updateQuery({ sort: parseSort(e.target.value) })}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          aria-label="Post list sort"
        >
          <option value="latest">Latest</option>
          <option value="views">Highest views</option>
          <option value="engagement">Highest engagement</option>
        </select>
        <button
          type="button"
          onClick={() => updateQuery({ range: DEFAULT_RANGE, sort: DEFAULT_SORT, platform: "all", q: "" })}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Clear filters
        </button>
      </fieldset>
      <p className="text-xs text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite" aria-atomic="true">
        Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} posts
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Analytics depth: {dateRange} selected · {plan.label} includes up to {limitLabel(plan.limits.analyticsMaxDays)} days
      </p>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
          Analytics appears after your first published posts.
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Link
              href="/create"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Create post
            </Link>
            <Link href="/scheduled" className="text-xs font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300">
              View scheduled posts
            </Link>
          </div>
        </div>
      ) : null}
      {!hasAdvancedAnalytics ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <p>{plan.label} plan: advanced analytics (longer ranges, insights, and charts) are available on Pro.</p>
          <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
            Upgrade
          </Link>
        </div>
      ) : null}

      {missingMetricsNotice ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <p>{missingMetricsNotice}</p>
        </div>
      ) : null}
      {templateNotice ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
          role="status"
          aria-live="polite"
        >
          <p>{templateNotice}</p>
          {savedTemplateId ? (
            <Link
              href={`/create?templateId=${encodeURIComponent(savedTemplateId)}`}
              className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100"
            >
              Use template
            </Link>
          ) : null}
          {templateNotice.toLowerCase().includes("limit") ? (
            <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
              Upgrade
            </Link>
          ) : null}
        </div>
      ) : null}

      {hasAdvancedAnalytics ? (
      <section aria-labelledby="analytics-insights-heading" className="space-y-2">
        <h2 id="analytics-insights-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Insights summary</h2>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            {insights.map((line, index) => (
              <li key={`${line}-${index}`} className="leading-6">
                {`\u2022 ${line}`}
              </li>
            ))}
          </ul>
        </div>
      </section>
      ) : null}

      <section aria-label="Analytics key metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Total posts" value={totals.totalPosts} />
        <KpiCard label="Total views" value={formatSum(totals.views)} hint={kpiHint(totals.views)} />
        <KpiCard label="Total likes" value={formatSum(totals.likes)} hint={kpiHint(totals.likes)} />
        <KpiCard label="Total comments" value={formatSum(totals.comments)} hint={kpiHint(totals.comments)} />
        <KpiCard label="Total shares" value={formatSum(totals.shares)} hint={kpiHint(totals.shares)} />
        <KpiCard
          label="Average engagement rate"
          value={formatRate(totals.avgEngagementRate)}
          hint={kpiHint({ total: 0, known: totals.completePosts })}
        />
      </section>

      {hasAdvancedAnalytics ? (
      <section aria-labelledby="analytics-performance-time-heading" className="space-y-2">
        <h2 id="analytics-performance-time-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Performance over time</h2>
        {timeSeriesRows.length === 0 || !hasAnyMetrics ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {timeSeriesRows.length === 0 ? "No trend data for this date range." : "No engagement metrics reported for this date range yet."}
          </p>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesRows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#52525b22" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={20} />
                  <YAxis yAxisId="views" tick={{ fontSize: 12 }} width={48} />
                  <YAxis yAxisId="engagement" orientation="right" tick={{ fontSize: 12 }} unit="%" width={48} />
                  <Tooltip
                    formatter={(value, name) => {
                      const metricName = typeof name === "string" ? name : String(name ?? "");
                      if (value == null) return ["—", metricName];
                      const numericValue = toNumericValue(value);
                      return metricName === "Engagement"
                        ? [`${numericValue.toFixed(2)}%`, metricName]
                        : [Math.floor(numericValue).toLocaleString(), metricName];
                    }}
                    labelFormatter={(value) => `Date: ${value}`}
                  />
                  <Legend />
                  <Line yAxisId="views" type="monotone" dataKey="views" name="Views" stroke="#2563eb" dot={false} strokeWidth={2} />
                  <Line
                    yAxisId="engagement"
                    type="monotone"
                    dataKey="engagementRatePct"
                    name="Engagement"
                    stroke="#16a34a"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>
      ) : null}

      {hasAdvancedAnalytics ? (
      <section aria-labelledby="analytics-platform-comparison-heading" className="space-y-2">
        <h2 id="analytics-platform-comparison-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Platform comparison</h2>
        {platformChartRows.length === 0 || !hasAnyMetrics ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {platformChartRows.length === 0
              ? "No platform comparison data for this date range."
              : "No engagement metrics reported for this date range yet."}
          </p>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformChartRows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#52525b22" />
                  <XAxis dataKey="platform" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="views" tick={{ fontSize: 12 }} width={48} />
                  <YAxis yAxisId="engagement" orientation="right" tick={{ fontSize: 12 }} unit="%" width={48} />
                  <Tooltip
                    formatter={(value, name) => {
                      const metricName = typeof name === "string" ? name : String(name ?? "");
                      if (value == null) return ["—", metricName];
                      const numericValue = toNumericValue(value);
                      return metricName === "Engagement"
                        ? [`${numericValue.toFixed(2)}%`, metricName]
                        : [Math.floor(numericValue).toLocaleString(), metricName];
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="views" dataKey="views" name="Views" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar
                    yAxisId="engagement"
                    dataKey="engagementRatePct"
                    name="Engagement"
                    fill="#16a34a"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>
      ) : null}

      {hasAdvancedAnalytics ? (
      <section aria-labelledby="analytics-top-posts-heading" className="space-y-2">
        <h2 id="analytics-top-posts-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Top posts by views</h2>
        {topPostsChartRows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filtered.length === 0 ? "No post data for this date range." : "No view counts reported for this date range yet."}
          </p>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topPostsChartRows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#52525b22" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-10} textAnchor="end" height={72} />
                  <YAxis tick={{ fontSize: 12 }} width={48} />
                  <Tooltip formatter={(value) => [Math.floor(toNumericValue(value)).toLocaleString(), "Views"]} />
                  <Bar dataKey="views" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>
      ) : null}

      <section aria-labelledby="analytics-platform-performance-heading" className="space-y-2">
        <h2 id="analytics-platform-performance-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Platform performance</h2>
        {platformRows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No platform performance data for this date range.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="min-w-full text-sm">
              <caption className="sr-only">
                Platform performance summary with columns for platform, posts, views, likes, and engagement rate.
              </caption>
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Platform</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Posts</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Views</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Likes</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Engagement rate</th>
                </tr>
              </thead>
              <tbody>
                {platformRows.map((row) => (
                  <tr key={row.platform} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900">
                    <th scope="row" className="px-3 py-2 text-left font-normal text-zinc-900 dark:text-zinc-100">
                      {platformLabel(row.platform)}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.posts}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{formatSum(row.views)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{formatSum(row.likes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{formatRate(row.engagementRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="analytics-post-performance-heading" className="space-y-2">
        <h2 id="analytics-post-performance-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Post performance</h2>
        {filtered.length > 0 ? (
          <div className="flex items-center gap-2" role="group" aria-label="Post performance view mode">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-pressed={viewMode === "table"}
              className={`rounded-md border px-2.5 py-1.5 text-xs ${
                viewMode === "table"
                  ? "border-zinc-800 bg-zinc-900 text-zinc-50 dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              Table view
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              aria-pressed={viewMode === "cards"}
              className={`rounded-md border px-2.5 py-1.5 text-xs ${
                viewMode === "cards"
                  ? "border-zinc-800 bg-zinc-900 text-zinc-50 dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              Card view
            </button>
          </div>
        ) : null}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
            <p>
              {query
                ? "No published posts match your search and filters."
                : "No published posts found for this date range."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => updateQuery({ range: DEFAULT_RANGE, sort: DEFAULT_SORT, platform: "all", q: "" })}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Reset filters
              </button>
              <Link href="/history" className="text-xs font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300">
                Check History
              </Link>
            </div>
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="min-w-full text-sm">
              <caption className="sr-only">
                Post performance table with columns for platform, publish time, preview, engagement metrics, optional advanced analytics columns, and actions.
              </caption>
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Platform</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Published</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Preview</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Views</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Likes</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Comments</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Shares</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Engagement</th>
                  {hasAdvancedAnalytics ? <th scope="col" className="px-3 py-2 text-left font-medium">Badge</th> : null}
                  {hasAdvancedAnalytics ? <th scope="col" className="px-3 py-2 text-left font-medium">Ranking</th> : null}
                  {hasAdvancedAnalytics ? <th scope="col" className="px-3 py-2 text-left font-medium">Best metric</th> : null}
                  {hasAdvancedAnalytics ? <th scope="col" className="px-3 py-2 text-left font-medium">Vs avg</th> : null}
                  <th scope="col" className="px-3 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {postDetails.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900">
                    <th scope="row" className="px-3 py-2 text-left font-normal text-zinc-900 dark:text-zinc-100">
                      {platformLabel(row.platform)}
                    </th>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-700 dark:text-zinc-300">{formatAt(row.publishedAt)}</td>
                    <td className="max-w-[360px] px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      <span className="sr-only">
                        Summary: {platformLabel(row.platform)} post with {spokenMetric(row.views, "views")}, {spokenMetric(row.likes, "likes")}, {spokenMetric(row.comments, "comments")}, {spokenMetric(row.shares, "shares")}, and {row.rowEngagementRate == null ? "engagement not available" : `${percent(row.rowEngagementRate)} engagement`}.
                      </span>
                      {row.preview}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${hasAdvancedAnalytics && row.bestMetric?.key === "views" ? "font-semibold text-violet-700 dark:text-violet-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                      {formatMetric(row.views)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${hasAdvancedAnalytics && row.bestMetric?.key === "likes" ? "font-semibold text-violet-700 dark:text-violet-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                      {formatMetric(row.likes)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{formatMetric(row.comments)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{formatMetric(row.shares)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${hasAdvancedAnalytics && row.bestMetric?.key === "engagement" ? "font-semibold text-violet-700 dark:text-violet-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                      {formatRate(row.rowEngagementRate)}
                    </td>
                    {hasAdvancedAnalytics ? <td className="px-3 py-2">
                      {row.badge == null ? (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>
                      ) : (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.badge === "high"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : row.badge === "medium"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                        aria-label={`Engagement badge: ${row.badge}`}
                      >
                        {row.badge}
                      </span>
                      )}
                    </td> : null}
                    {hasAdvancedAnalytics ? <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">{row.rank ?? "—"}</td> : null}
                    {hasAdvancedAnalytics ? <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
                      {row.rowEngagementRate == null
                        ? "—"
                        : row.bestMetric
                          ? `${row.bestMetric.key} (+${row.bestMetric.delta.toFixed(0)}%)`
                          : "None"}
                    </td> : null}
                    {hasAdvancedAnalytics ? <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
                      {row.viewsDeltaPct == null || row.engagementDeltaPct == null ? (
                        "—"
                      ) : (
                        <>
                          {formatDeltaSentence(row.viewsDeltaPct, "views")}
                          <br />
                          {formatDeltaSentence(row.engagementDeltaPct, "engagement")}
                        </>
                      )}
                    </td> : null}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleSaveTemplate(row.id)}
                          disabled={savingTemplateId === row.id}
                          className="promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                        >
                          {savingTemplateId === row.id ? "Saving…" : "Save template"}
                        </button>
                        <Link
                          href={`/create?sourcePostId=${encodeURIComponent(row.id)}&mode=duplicate`}
                          className="promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                        >
                          Duplicate
                        </Link>
                        <Link
                          href={`/create?sourcePostId=${encodeURIComponent(row.id)}&mode=reschedule`}
                          className="promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                        >
                          Reschedule
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {postDetails.map((row) => (
              <article
                key={row.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <p className="sr-only">
                  Post summary: {platformLabel(row.platform)} published {formatAt(row.publishedAt)} with {spokenMetric(row.views, "views")}, {spokenMetric(row.likes, "likes")}, {spokenMetric(row.comments, "comments")}, {spokenMetric(row.shares, "shares")}, and {row.rowEngagementRate == null ? "engagement not available" : `${percent(row.rowEngagementRate)} engagement`}.
                </p>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{platformLabel(row.platform)}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{formatAt(row.publishedAt)}</p>
                  </div>
                  {hasAdvancedAnalytics && row.badge != null ? <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.badge === "high"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : row.badge === "medium"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                    aria-label={`Engagement badge: ${row.badge}`}
                  >
                    {row.badge}
                  </span> : null}
                </div>

                <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{clampPreview(row.preview, 150)}</p>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <p className={`rounded-md border p-2 ${row.bestMetric?.key === "views" ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300" : "border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"}`}>Views: <span className="tabular-nums">{formatMetric(row.views)}</span></p>
                  <p className={`rounded-md border p-2 ${row.bestMetric?.key === "likes" ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300" : "border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"}`}>Likes: <span className="tabular-nums">{formatMetric(row.likes)}</span></p>
                  <p className="rounded-md border border-zinc-200 p-2 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">Comments: <span className="tabular-nums">{formatMetric(row.comments)}</span></p>
                  <p className="rounded-md border border-zinc-200 p-2 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">Shares: <span className="tabular-nums">{formatMetric(row.shares)}</span></p>
                </div>

                <p className={`mt-2 text-xs ${hasAdvancedAnalytics && row.bestMetric?.key === "engagement" ? "font-semibold text-violet-700 dark:text-violet-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                  Engagement rate: {row.rowEngagementRate == null ? "Not available yet" : percent(row.rowEngagementRate)}
                </p>
                {hasAdvancedAnalytics && row.rank != null ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Ranking: {row.rank}</p> : null}
                {hasAdvancedAnalytics && row.rowEngagementRate != null ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {row.bestMetric ? `Best metric: ${row.bestMetric.key} (+${row.bestMetric.delta.toFixed(0)}%)` : "Best metric: None"}
                </p> : null}
                {hasAdvancedAnalytics && row.viewsDeltaPct != null ? <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">{formatDeltaSentence(row.viewsDeltaPct, "views")}</p> : null}
                {hasAdvancedAnalytics && row.engagementDeltaPct != null ? <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                  {formatDeltaSentence(row.engagementDeltaPct, "engagement")}
                </p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveTemplate(row.id)}
                    disabled={savingTemplateId === row.id}
                    className="promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                  >
                    {savingTemplateId === row.id ? "Saving…" : "Save template"}
                  </button>
                  <Link
                    href={`/create?sourcePostId=${encodeURIComponent(row.id)}&mode=duplicate`}
                    className="promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                  >
                    Duplicate
                  </Link>
                  <Link
                    href={`/create?sourcePostId=${encodeURIComponent(row.id)}&mode=reschedule`}
                    className="promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                  >
                    Reschedule
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

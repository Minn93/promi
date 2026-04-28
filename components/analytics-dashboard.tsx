"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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

type AnalyticsRow = {
  id: string;
  platform: Platform;
  publishedAt: string;
  preview: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

type AnalyticsDashboardProps = {
  rows: AnalyticsRow[];
  usesFallbackMetrics: boolean;
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
  if (platform === "x") return "X";
  if (platform === "instagram") return "Instagram";
  return "Facebook";
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

function engagementRate(item: Pick<AnalyticsRow, "views" | "likes" | "comments" | "shares">): number {
  if (item.views <= 0) return 0;
  return (item.likes + item.comments + item.shares) / item.views;
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
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

export function AnalyticsDashboard({ rows, usesFallbackMetrics, planTier }: AnalyticsDashboardProps) {
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
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);

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
        return b.views - a.views;
      }
      return engagementRate(b) - engagementRate(a);
    });
  }, [rows, dateRange, sortBy, platformFilter, query]);

  const totals = useMemo(() => {
    const totalPosts = filtered.length;
    const totalViews = filtered.reduce((sum, row) => sum + clampInt(row.views), 0);
    const totalLikes = filtered.reduce((sum, row) => sum + clampInt(row.likes), 0);
    const totalComments = filtered.reduce((sum, row) => sum + clampInt(row.comments), 0);
    const totalShares = filtered.reduce((sum, row) => sum + clampInt(row.shares), 0);
    const avgEngagementRate = totalViews > 0 ? (totalLikes + totalComments + totalShares) / totalViews : 0;
    return { totalPosts, totalViews, totalLikes, totalComments, totalShares, avgEngagementRate };
  }, [filtered]);

  const platformRows = useMemo(() => {
    const map = new Map<Platform, { posts: number; views: number; likes: number; comments: number; shares: number }>();
    for (const row of filtered) {
      const current = map.get(row.platform) ?? { posts: 0, views: 0, likes: 0, comments: 0, shares: 0 };
      current.posts += 1;
      current.views += clampInt(row.views);
      current.likes += clampInt(row.likes);
      current.comments += clampInt(row.comments);
      current.shares += clampInt(row.shares);
      map.set(row.platform, current);
    }
    return (["x", "instagram", "facebook"] as Platform[])
      .map((platform) => {
        const data = map.get(platform) ?? { posts: 0, views: 0, likes: 0, comments: 0, shares: 0 };
        const rate = data.views > 0 ? (data.likes + data.comments + data.shares) / data.views : 0;
        return { platform, ...data, engagementRate: rate };
      })
      .filter((item) => item.posts > 0);
  }, [filtered]);

  const timeSeriesRows = useMemo(() => {
    const daily = new Map<string, { views: number; interactions: number; posts: number; dateMs: number }>();
    for (const row of filtered) {
      const date = new Date(row.publishedAt);
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dateKey = dateOnly.toISOString().slice(0, 10);
      const current = daily.get(dateKey) ?? { views: 0, interactions: 0, posts: 0, dateMs: dateOnly.getTime() };
      const views = clampInt(row.views);
      const interactions = clampInt(row.likes) + clampInt(row.comments) + clampInt(row.shares);
      current.views += views;
      current.interactions += interactions;
      current.posts += 1;
      daily.set(dateKey, current);
    }
    return [...daily.entries()]
      .sort((a, b) => a[1].dateMs - b[1].dateMs)
      .map(([dateKey, value]) => ({
        dateKey,
        label: shortDate(dateKey),
        views: value.views,
        engagementRatePct: value.views > 0 ? (value.interactions / value.views) * 100 : 0,
      }));
  }, [filtered]);

  const platformChartRows = useMemo(
    () =>
      platformRows.map((row) => ({
        platform: platformLabel(row.platform),
        views: row.views,
        engagementRatePct: Number((row.engagementRate * 100).toFixed(2)),
      })),
    [platformRows],
  );

  const topPostsChartRows = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => b.views - a.views)
        .slice(0, 5)
        .map((row) => ({
          id: row.id,
          label: `${platformLabel(row.platform)} - ${clampPreview(row.preview, 42)}`,
          views: row.views,
        })),
    [filtered],
  );

  const postDetails = useMemo(() => {
    const totalPosts = filtered.length;
    if (totalPosts === 0) return [];

    const avgViews = totals.totalViews / totalPosts;
    const avgLikes = totals.totalLikes / totalPosts;
    const avgComments = totals.totalComments / totalPosts;
    const avgShares = totals.totalShares / totalPosts;
    const avgEngagement = totals.avgEngagementRate;

    const maxViews = Math.max(...filtered.map((row) => clampInt(row.views)), 1);
    const maxEngagement = Math.max(...filtered.map((row) => engagementRate(row)), 0.0001);

    const scoreById = new Map(
      filtered.map((row) => {
        const normalizedViews = clampInt(row.views) / maxViews;
        const normalizedEngagement = engagementRate(row) / maxEngagement;
        const score = normalizedEngagement * 0.55 + normalizedViews * 0.45;
        return [row.id, score] as const;
      }),
    );

    const rankedIds = [...filtered]
      .sort((a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0))
      .map((row) => row.id);

    const engagementRankedIds = [...filtered]
      .sort((a, b) => engagementRate(b) - engagementRate(a))
      .map((row) => row.id);

    const rankMap = new Map(rankedIds.map((id, idx) => [id, idx]));
    const engagementRankMap = new Map(engagementRankedIds.map((id, idx) => [id, idx]));

    return filtered.map((row) => {
      const rowEngagementRate = engagementRate(row);
      const rankIndex = rankMap.get(row.id) ?? totalPosts - 1;
      const engagementRankIndex = engagementRankMap.get(row.id) ?? totalPosts - 1;
      const percentile = totalPosts === 1 ? 1 : 1 - rankIndex / (totalPosts - 1);
      const engagementPercentile = totalPosts === 1 ? 1 : 1 - engagementRankIndex / (totalPosts - 1);

      const metricDeltas: Record<MetricKey, number> = {
        views: toPercentDelta(clampInt(row.views), avgViews),
        likes: toPercentDelta(clampInt(row.likes), avgLikes),
        comments: toPercentDelta(clampInt(row.comments), avgComments),
        shares: toPercentDelta(clampInt(row.shares), avgShares),
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

    const topByEngagement = platformRows.reduce<(typeof platformRows)[number] | null>(
      (best, row) => {
        if (!best) return row;
        return row.engagementRate > best.engagementRate ? row : best;
      },
      null,
    );

    const topByViews = platformRows.reduce<(typeof platformRows)[number] | null>(
      (best, row) => {
        if (!best) return row;
        return row.views > best.views ? row : best;
      },
      null,
    );

    const bestPost = filtered.reduce<AnalyticsRow | null>((best, row) => {
      if (!best) return row;
      return row.views > best.views ? row : best;
    }, null);

    const lines: string[] = [];
    if (topByEngagement) {
      lines.push(`${platformLabel(topByEngagement.platform)} has the highest engagement rate in this range.`);
    }
    if (topByViews) {
      lines.push(`${platformLabel(topByViews.platform)} has the most views in this range.`);
    }
    if (bestPost) {
      lines.push(`Your top post reached ${clampInt(bestPost.views).toLocaleString()} views.`);
    }
    lines.push(`You published ${totals.totalPosts.toLocaleString()} posts in this period.`);
    lines.push(`Average engagement rate is ${percent(totals.avgEngagementRate)}.`);
    return lines;
  }, [filtered, platformRows, totals.totalPosts, totals.avgEngagementRate]);

  const handleSaveTemplate = useCallback(async (scheduledPostId: string) => {
    setTemplateNotice(null);
    setSavingTemplateId(scheduledPostId);
    const result = await saveReusableTemplateFromScheduledPostId(scheduledPostId);
    if (result.error) {
      setTemplateNotice(result.error);
      setSavingTemplateId(null);
      return;
    }
    setTemplateNotice(`Template saved: ${result.template?.name ?? "Reusable template"}`);
    setSavingTemplateId(null);
  }, []);

  return (
    <section aria-label="Analytics dashboard panels" className="space-y-6">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Analytics filters</legend>
        <input
          type="search"
          value={query}
          onChange={(e) => updateQuery({ q: e.target.value })}
          placeholder="Search preview or post ID"
          className="min-w-[220px] rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-500"
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
          Analytics appears after your first published posts. After scheduled time, it can take a short moment for server publishing results to appear.
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/create"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Create first post
            </Link>
            <Link
              href="/scheduled"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Schedule a post
            </Link>
            <Link
              href="/history"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Check History
            </Link>
          </div>
        </div>
      ) : null}
      {!hasAdvancedAnalytics ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <p>Free plan: advanced analytics (longer ranges, insights, and charts) are available on Pro.</p>
          <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
            Upgrade to Pro
          </Link>
        </div>
      ) : null}

      {usesFallbackMetrics ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <p>Some metrics are estimated because provider data is partially unavailable.</p>
          <Link href="/history" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
            Check History
          </Link>
        </div>
      ) : null}
      {templateNotice ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
          role="status"
          aria-live="polite"
        >
          <p>{templateNotice}</p>
          {templateNotice.toLowerCase().includes("limit") ? (
            <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
              Upgrade to Pro
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
        <KpiCard label="Total views" value={totals.totalViews} />
        <KpiCard label="Total likes" value={totals.totalLikes} />
        <KpiCard label="Total comments" value={totals.totalComments} />
        <KpiCard label="Total shares" value={totals.totalShares} />
        <KpiCard label="Average engagement rate" value={percent(totals.avgEngagementRate)} />
      </section>

      {hasAdvancedAnalytics ? (
      <section aria-labelledby="analytics-performance-time-heading" className="space-y-2">
        <h2 id="analytics-performance-time-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Performance over time</h2>
        {timeSeriesRows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No trend data for this date range.</p>
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
        {platformChartRows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No platform comparison data for this date range.</p>
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
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No post data for this date range.</p>
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
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.views}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.likes}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{percent(row.engagementRate)}</td>
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
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateQuery({ range: DEFAULT_RANGE, sort: DEFAULT_SORT, platform: "all", q: "" })}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Reset filters
              </button>
              <Link
                href="/scheduled"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Open Scheduled queue
              </Link>
              <Link
                href="/history"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
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
                        Summary: {platformLabel(row.platform)} post with {row.views.toLocaleString()} views, {row.likes.toLocaleString()} likes, {row.comments.toLocaleString()} comments, {row.shares.toLocaleString()} shares, and {percent(row.rowEngagementRate)} engagement.
                      </span>
                      {row.preview}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${hasAdvancedAnalytics && row.bestMetric?.key === "views" ? "font-semibold text-violet-700 dark:text-violet-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                      {row.views}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${hasAdvancedAnalytics && row.bestMetric?.key === "likes" ? "font-semibold text-violet-700 dark:text-violet-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                      {row.likes}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.comments}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.shares}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${hasAdvancedAnalytics && row.bestMetric?.key === "engagement" ? "font-semibold text-violet-700 dark:text-violet-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                      {percent(row.rowEngagementRate)}
                    </td>
                    {hasAdvancedAnalytics ? <td className="px-3 py-2">
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
                    </td> : null}
                    {hasAdvancedAnalytics ? <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">{row.rank}</td> : null}
                    {hasAdvancedAnalytics ? <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
                      {row.bestMetric ? `${row.bestMetric.key} (+${row.bestMetric.delta.toFixed(0)}%)` : "None"}
                    </td> : null}
                    {hasAdvancedAnalytics ? <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
                      {formatDeltaSentence(row.viewsDeltaPct, "views")}
                      <br />
                      {formatDeltaSentence(row.engagementDeltaPct, "engagement")}
                    </td> : null}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleSaveTemplate(row.id)}
                          disabled={savingTemplateId === row.id}
                          className="promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                        >
                          {savingTemplateId === row.id ? "Saving..." : "Save template"}
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
                  Post summary: {platformLabel(row.platform)} published {formatAt(row.publishedAt)} with {row.views.toLocaleString()} views, {row.likes.toLocaleString()} likes, {row.comments.toLocaleString()} comments, {row.shares.toLocaleString()} shares, and {percent(row.rowEngagementRate)} engagement.
                </p>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{platformLabel(row.platform)}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{formatAt(row.publishedAt)}</p>
                  </div>
                  {hasAdvancedAnalytics ? <span
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
                  <p className={`rounded-md border p-2 ${row.bestMetric?.key === "views" ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300" : "border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"}`}>Views: <span className="tabular-nums">{row.views}</span></p>
                  <p className={`rounded-md border p-2 ${row.bestMetric?.key === "likes" ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300" : "border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"}`}>Likes: <span className="tabular-nums">{row.likes}</span></p>
                  <p className="rounded-md border border-zinc-200 p-2 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">Comments: <span className="tabular-nums">{row.comments}</span></p>
                  <p className="rounded-md border border-zinc-200 p-2 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">Shares: <span className="tabular-nums">{row.shares}</span></p>
                </div>

                <p className={`mt-2 text-xs ${hasAdvancedAnalytics && row.bestMetric?.key === "engagement" ? "font-semibold text-violet-700 dark:text-violet-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                  Engagement rate: {percent(row.rowEngagementRate)}
                </p>
                {hasAdvancedAnalytics ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Ranking: {row.rank}</p> : null}
                {hasAdvancedAnalytics ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {row.bestMetric ? `Best metric: ${row.bestMetric.key} (+${row.bestMetric.delta.toFixed(0)}%)` : "Best metric: None"}
                </p> : null}
                {hasAdvancedAnalytics ? <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">{formatDeltaSentence(row.viewsDeltaPct, "views")}</p> : null}
                {hasAdvancedAnalytics ? <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                  {formatDeltaSentence(row.engagementDeltaPct, "engagement")}
                </p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveTemplate(row.id)}
                    disabled={savingTemplateId === row.id}
                    className="promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                  >
                    {savingTemplateId === row.id ? "Saving..." : "Save template"}
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

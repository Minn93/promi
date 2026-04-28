"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getClientPlanTier, getPlanConfig, limitLabel } from "@/src/lib/plans/config";
import { getPostStatusCopy } from "@/lib/post-status-copy";
import { toUserFacingError } from "@/lib/user-facing-error";

type ScheduledPost = {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  channels: unknown;
  contentPayload: unknown;
  scheduledAt: string;
  platform: "x" | "instagram" | "facebook";
  status: "scheduled" | "processing" | "published" | "failed" | "needs_reconnect" | "cancelled";
  errorCode: string | null;
  errorMessage: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
};

type StatusFilter = "all" | "scheduled" | "processing" | "published" | "failed" | "needs_reconnect" | "cancelled";
type PlatformFilter = "all" | "x" | "instagram" | "facebook";
type SortOrder = "newest" | "oldest";
type ViewMode = "list" | "calendar";
type FailureKind = "auth" | "publish" | "validation" | "plan" | "temporary" | "unknown";
const UI_STATE_KEY = "promi:scheduled-ui:v2";

const REFRESH_EVENT = "promi:scheduled-posts-updated";
const POLL_INTERVAL_MS = 5000;
const OVERDUE_TICK_MS = 1000;
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500/40 dark:focus-visible:ring-offset-zinc-950";

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
  if (isOverdue) return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "scheduled") return "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
  if (status === "processing") return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  if (status === "published") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "failed") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (status === "needs_reconnect") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function isRetryableErrorCode(code: string | null): boolean {
  if (!code) return false;
  return code === "RATE_LIMITED" || code === "PROVIDER_UNAVAILABLE" || code === "PLATFORM_FAILURE" || code === "UNKNOWN";
}

function mapFailureDetails(post: Pick<ScheduledPost, "errorCode" | "errorMessage" | "lastError">): { kind: FailureKind; message: string } | null {
  const code = post.errorCode?.trim().toUpperCase() ?? "";
  const rawMessage = post.errorMessage?.trim() || post.lastError?.trim() || "";
  const normalized = rawMessage.toLowerCase();

  if (code === "TOKEN_REFRESH_FAILED") {
    return { kind: "auth", message: "Your login expired. Reconnect this account, then retry." };
  }
  if (code === "X_AUTH_REQUIRED") {
    return { kind: "auth", message: "This account needs reconnect before publishing can continue." };
  }
  if (code === "AUTH_REVOKED" || normalized.includes("(403)") || normalized.includes("forbidden")) {
    return { kind: "auth", message: "Access was revoked. Reconnect the account, then retry." };
  }
  if (
    normalized.includes("creditsdepleted")
    || normalized.includes("credits depleted")
    || (normalized.includes("(402)") && normalized.includes("credit"))
  ) {
    return { kind: "plan", message: "Publishing credits are depleted. Upgrade or add credits, then retry." };
  }
  if (
    code === "VALIDATION_FAILED"
    || normalized.includes("validation")
    || normalized.includes("invalid")
    || normalized.includes("280")
    || normalized.includes("text too long")
    || normalized.includes("exceeds 280")
    || normalized.includes("maximum 280")
  ) {
    return { kind: "validation", message: "Post content needs edits before it can publish." };
  }
  if (
    normalized.includes("media upload")
    || normalized.includes("image")
    || normalized.includes("media id")
    || normalized.includes("5mb")
    || normalized.includes("jpg")
    || normalized.includes("jpeg")
    || normalized.includes("png")
    || normalized.includes("webp")
  ) {
    return { kind: "validation", message: "Image could not be uploaded. Use JPG/PNG/WebP under 5MB and retry." };
  }
  if (code.startsWith("PLAN_LIMIT_")) {
    return { kind: "plan", message: "Your current plan limit blocked this action." };
  }
  if (code === "RATE_LIMITED" || code === "PROVIDER_UNAVAILABLE") {
    return { kind: "temporary", message: "The platform is temporarily unavailable. Try again shortly." };
  }
  if (code === "PLATFORM_FAILURE") {
    return { kind: "publish", message: "Publishing failed at the platform. Retry now or reschedule." };
  }
  if (rawMessage) return { kind: "unknown", message: rawMessage };
  if (code) return { kind: "unknown", message: "Publishing failed for an unknown reason." };
  return null;
}

function formatAttemptAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dateTimeFormatter.format(d);
}

function platformLabel(platform: ScheduledPost["platform"]): string {
  if (platform === "x") return "X";
  if (platform === "instagram") return "Instagram";
  return "Facebook";
}

function isNeedsReconnect(post: Pick<ScheduledPost, "status" | "errorCode">): boolean {
  return (
    post.status === "needs_reconnect"
    || post.errorCode === "ACCOUNT_INACTIVE"
    || post.errorCode === "AUTH_EXPIRED"
    || post.errorCode === "AUTH_REVOKED"
    || post.errorCode === "ACCOUNT_NOT_FOUND"
    || post.errorCode === "TOKEN_REFRESH_FAILED"
    || post.errorCode === "X_AUTH_REQUIRED"
  );
}

function failureLabel(kind: FailureKind): string {
  if (kind === "auth") return "Connection issue";
  if (kind === "validation") return "Validation issue";
  if (kind === "plan") return "Plan limit";
  if (kind === "temporary") return "Temporary issue";
  if (kind === "publish") return "Publish failure";
  return "Unknown issue";
}

function toDateKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toDateKeyFromDate(d);
}

function toDateKeyFromDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimeOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(d);
}

function monthTitle(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(d);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export function ServerScheduledPostsList() {
  const [items, setItems] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorCode, setActionErrorCode] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [announceFilterResults, setAnnounceFilterResults] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [activeScheduledCount, setActiveScheduledCount] = useState<number | null>(null);
  const loadErrorRef = useRef<HTMLDivElement | null>(null);
  const actionErrorRef = useRef<HTMLDivElement | null>(null);
  const plan = getPlanConfig(getClientPlanTier());

  const refresh = useCallback(async () => {
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch("/api/scheduled-posts?limit=100", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { data?: ScheduledPost[]; error?: string; code?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Could not load scheduled posts.");
        setErrorCode(body?.code ?? null);
        return;
      }
      const next = Array.isArray(body?.data) ? body.data : [];
      setItems(next);
    } catch {
      setError("Could not load scheduled posts.");
      setErrorCode(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshActiveUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduled-posts?summary=active_count", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { data?: { activeScheduledPosts?: number } } | null;
      if (!res.ok) return;
      if (typeof body?.data?.activeScheduledPosts === "number") {
        setActiveScheduledCount(body.data.activeScheduledPosts);
      }
    } catch {
      // usage indicator only
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshActiveUsage();

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
  }, [refresh, refreshActiveUsage]);

  useEffect(() => {
    const tickId = window.setInterval(() => {
      setNowMs(Date.now());
    }, OVERDUE_TICK_MS);
    return () => window.clearInterval(tickId);
  }, []);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(UI_STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        statusFilter?: StatusFilter;
        platformFilter?: PlatformFilter;
        sortOrder?: SortOrder;
        viewMode?: ViewMode;
        query?: string;
      };
      if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
      if (parsed.platformFilter) setPlatformFilter(parsed.platformFilter);
      if (parsed.sortOrder) setSortOrder(parsed.sortOrder);
      if (parsed.viewMode) setViewMode(parsed.viewMode);
      if (typeof parsed.query === "string") setQuery(parsed.query);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        UI_STATE_KEY,
        JSON.stringify({ statusFilter, platformFilter, sortOrder, viewMode, query }),
      );
    } catch {
      // non-blocking
    }
  }, [statusFilter, platformFilter, sortOrder, viewMode, query]);

  useEffect(() => {
    if (actionError && actionErrorRef.current) {
      actionErrorRef.current.focus();
      return;
    }
    if (error && loadErrorRef.current) {
      loadErrorRef.current.focus();
    }
  }, [actionError, error]);

  useEffect(() => {
    if (!announceFilterResults) return;
    const timeoutId = window.setTimeout(() => {
      setAnnounceFilterResults(false);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [announceFilterResults, statusFilter, platformFilter, sortOrder, viewMode, query]);

  const handleCancel = async (id: string) => {
    if (!window.confirm("Cancel this scheduled post? This cannot be undone.")) return;
    setActionError(null);
    setActionErrorCode(null);
    setCancellingId(id);
    try {
      const res = await fetch(`/api/scheduled-posts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Cancelled by user." }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (!res.ok) {
        setActionError(body?.error ?? "Could not cancel this scheduled post.");
        setActionErrorCode(body?.code ?? null);
        return;
      }
      await refresh();
      await refreshActiveUsage();
    } catch {
      setActionError("Could not cancel this scheduled post.");
      setActionErrorCode(null);
    } finally {
      setCancellingId(null);
    }
  };

  const handleRetry = async (id: string) => {
    setActionError(null);
    setActionErrorCode(null);
    setRetryingId(id);
    try {
      const res = await fetch(`/api/scheduled-posts/${encodeURIComponent(id)}/retry`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: string; details?: string; code?: string } | null;
      if (!res.ok) {
        setActionError(body?.error ?? body?.details ?? "Could not retry this scheduled post.");
        setActionErrorCode(body?.code ?? null);
        return;
      }
      await refresh();
      await refreshActiveUsage();
    } catch {
      setActionError("Could not retry this scheduled post.");
      setActionErrorCode(null);
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) {
    return (
      <div
        className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
        role="status"
        aria-live="polite"
      >
        Loading scheduled posts...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-950">
        {error ? (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No scheduled posts yet. Schedule your first post to see upcoming publishing in one place.
        </p>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          This is your server publishing queue. Device-only drafts stay in Drafts.
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Publishing can start shortly after the exact scheduled minute.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/create"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create first post
          </Link>
          <Link
            href="/settings/accounts"
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Connect account
          </Link>
          <Link
            href="/history"
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Check History
          </Link>
        </div>
      </div>
    );
  }

  const filtered = items
    .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
    .filter((item) => (platformFilter === "all" ? true : item.platform === platformFilter))
    .filter((item) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [
        item.productName,
        item.id,
        platformLabel(item.platform),
        readPreview(item.contentPayload),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      const aMs = new Date(a.scheduledAt).getTime();
      const bMs = new Date(b.scheduledAt).getTime();
      if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
      return sortOrder === "newest" ? bMs - aMs : aMs - bMs;
    });

  const postsByDate = filtered.reduce<Map<string, ScheduledPost[]>>((map, post) => {
    const key = toDateKey(post.scheduledAt);
    if (!key) return map;
    const arr = map.get(key) ?? [];
    arr.push(post);
    map.set(key, arr);
    return map;
  }, new Map());
  for (const [, arr] of postsByDate) {
    arr.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }

  const monthStart = startOfMonth(calendarMonth);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const dayCells = Array.from({ length: 42 }).map((_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const key = toDateKeyFromDate(date);
    return {
      key,
      date,
      inMonth: date.getMonth() === monthStart.getMonth(),
      posts: postsByDate.get(key) ?? [],
    };
  });

  const activeSelectedDateKey =
    selectedDateKey && postsByDate.has(selectedDateKey)
      ? selectedDateKey
      : filtered[0]
        ? toDateKey(filtered[0].scheduledAt)
        : null;

  const selectedPosts =
    (activeSelectedDateKey ? postsByDate.get(activeSelectedDateKey) ?? [] : [])
      .slice()
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const loadErrorDetails = error ? toUserFacingError(errorCode, error) : null;
  const actionErrorDetails = actionError ? toUserFacingError(actionErrorCode, actionError) : null;

  return (
    <section aria-label="Scheduled post queue controls and results" className="space-y-3">
      <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
        Plan: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{plan.label}</span> · Active scheduled posts:{" "}
        {activeScheduledCount ?? "..."}/{limitLabel(plan.limits.scheduledPostsActive)}
        {getClientPlanTier() === "free" ? (
          <>
            {" "}
            <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
              Upgrade to Pro
            </Link>
          </>
        ) : null}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        The server scheduler checks this queue continuously. A post can move to Processing shortly after its scheduled time.
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Needs attention first:{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{getPostStatusCopy("failed").label}</span> and{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{getPostStatusCopy("needs_reconnect").label}</span>.
      </p>
      {error ? (
        <div
          ref={loadErrorRef}
          tabIndex={-1}
          className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-red-700 dark:text-red-300" role="alert">
              {loadErrorDetails?.message ?? error}
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50"
            >
              Retry
            </button>
          </div>
          {loadErrorDetails?.actions.map((action) => (
            <Link
              key={`${action.href}-${action.label}`}
              href={action.href}
              className="mr-3 text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100"
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
      {actionError ? (
        <div
          ref={actionErrorRef}
          tabIndex={-1}
          className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30"
        >
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            {actionErrorDetails?.message ?? actionError}
          </p>
          {actionErrorDetails?.actions.map((action) => (
            <Link
              key={`${action.href}-${action.label}`}
              href={action.href}
              className="mr-3 text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100"
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Scheduled post filters and view options</legend>
        <button
          type="button"
          onClick={() => {
            setViewMode("list");
            setAnnounceFilterResults(true);
          }}
          className={`rounded-md border px-2.5 py-1.5 text-xs ${FOCUS_RING} ${
            viewMode === "list"
              ? "border-zinc-800 bg-zinc-900 text-zinc-50 dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          }`}
        >
          List view
        </button>
        <button
          type="button"
          onClick={() => {
            setViewMode("calendar");
            setAnnounceFilterResults(true);
          }}
          className={`rounded-md border px-2.5 py-1.5 text-xs ${FOCUS_RING} ${
            viewMode === "calendar"
              ? "border-zinc-800 bg-zinc-900 text-zinc-50 dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          }`}
        >
          Calendar view
        </button>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAnnounceFilterResults(true);
          }}
          placeholder="Search product, snippet, or ID"
          className="min-w-[220px] rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-500"
          aria-label="Search scheduled posts"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setAnnounceFilterResults(true);
          }}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          aria-label="Filter scheduled posts by status"
        >
          <option value="all">All statuses</option>
          <option value="scheduled">{getPostStatusCopy("scheduled").label}</option>
          <option value="processing">{getPostStatusCopy("processing").label}</option>
          <option value="published">{getPostStatusCopy("published").label}</option>
          <option value="failed">{getPostStatusCopy("failed").label}</option>
          <option value="needs_reconnect">{getPostStatusCopy("needs_reconnect").label}</option>
          <option value="cancelled">{getPostStatusCopy("cancelled").label}</option>
        </select>
        <select
          value={platformFilter}
          onChange={(e) => {
            setPlatformFilter(e.target.value as PlatformFilter);
            setAnnounceFilterResults(true);
          }}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          aria-label="Filter scheduled posts by platform"
        >
          <option value="all">All platforms</option>
          <option value="x">X</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => {
            setSortOrder(e.target.value as SortOrder);
            setAnnounceFilterResults(true);
          }}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          aria-label="Sort scheduled posts"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setStatusFilter("all");
            setPlatformFilter("all");
            setSortOrder("newest");
            setQuery("");
            setAnnounceFilterResults(true);
          }}
          className={`rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 ${FOCUS_RING}`}
        >
          Clear filters
        </button>
      </fieldset>
      <p
        className="text-xs text-zinc-500 dark:text-zinc-400"
        role={announceFilterResults ? "status" : undefined}
        aria-live={announceFilterResults ? "polite" : undefined}
        aria-atomic={announceFilterResults || undefined}
      >
        Showing {filtered.length.toLocaleString()} of {items.length.toLocaleString()} scheduled posts
      </p>
      {filtered.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
          role="status"
          aria-live="polite"
        >
          {query.trim()
            ? "No scheduled posts match your search and filters."
            : "No scheduled posts match the current filters."}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setPlatformFilter("all");
                setSortOrder("newest");
                setQuery("");
                setAnnounceFilterResults(true);
              }}
              className={`rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 ${FOCUS_RING}`}
            >
              Reset filters
            </button>
            <Link
              href="/create"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Create post
            </Link>
          </div>
        </div>
      ) : null}
      {filtered.length > 0 && viewMode === "calendar" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => setCalendarMonth((prev) => addMonths(prev, -1))}
              className={`rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
            >
              Prev
            </button>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{monthTitle(calendarMonth)}</p>
            <button
              type="button"
              onClick={() => setCalendarMonth((prev) => addMonths(prev, 1))}
              className={`rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
            >
              Next
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="grid min-w-[900px] grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="px-2 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid min-w-[900px] grid-cols-7">
              {dayCells.map((cell) => {
                const isSelected = activeSelectedDateKey === cell.key;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => setSelectedDateKey(cell.key)}
                    className={`min-h-[120px] border-b border-r border-zinc-100 p-2 text-left last:border-r-0 dark:border-zinc-900 ${FOCUS_RING} ${
                      isSelected ? "bg-zinc-100/70 dark:bg-zinc-900/60" : "bg-white dark:bg-zinc-950"
                    } ${cell.inMonth ? "" : "opacity-55"}`}
                  >
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{cell.date.getDate()}</p>
                    <div className="mt-1 space-y-1">
                      {cell.posts.slice(0, 2).map((post) => {
                        const scheduledAtMs = new Date(post.scheduledAt).getTime();
                        const isOverdue = Number.isFinite(scheduledAtMs) && post.status === "scheduled" && scheduledAtMs <= nowMs;
                        const href =
                          post.status === "scheduled"
                            ? `/scheduled/${encodeURIComponent(post.id)}/edit`
                            : `/create?sourcePostId=${encodeURIComponent(post.id)}&mode=reschedule`;
                        return (
                          <Link
                            key={post.id}
                            href={href}
                            onClick={(event) => event.stopPropagation()}
                            className="block rounded border border-zinc-200 px-1.5 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                            title={readPreview(post.contentPayload)}
                          >
                            <p className="truncate">{platformLabel(post.platform)} • {formatTimeOnly(post.scheduledAt)}</p>
                            <p className="truncate text-zinc-500 dark:text-zinc-400">
                              {getPostStatusCopy(post.status, { isOverdue }).label}
                            </p>
                          </Link>
                        );
                      })}
                      {cell.posts.length > 2 ? (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">+{cell.posts.length - 2} more</p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {activeSelectedDateKey ? `Posts on ${activeSelectedDateKey}` : "Select a date"}
            </h3>
            {activeSelectedDateKey && selectedPosts.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No scheduled posts for this date.</p>
            ) : null}
            {activeSelectedDateKey && selectedPosts.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {selectedPosts.map((p) => {
                  const scheduledAtMs = new Date(p.scheduledAt).getTime();
                  const isOverdue = Number.isFinite(scheduledAtMs) && p.status === "scheduled" && scheduledAtMs <= nowMs;
                  const editable = p.status === "scheduled";
                  const retryable = p.status === "failed" && isRetryableErrorCode(p.errorCode);
                  const needsReconnect = isNeedsReconnect(p);
                  const actionBusy = cancellingId === p.id || retryingId === p.id;
                  return (
                    <li key={p.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {platformLabel(p.platform)} • {formatTimeOnly(p.scheduledAt)}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClassName(p.status, isOverdue)}`}
                          aria-label={`Post status: ${getPostStatusCopy(p.status, { isOverdue }).label}`}
                        >
                          {getPostStatusCopy(p.status, { isOverdue }).label}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{readPreview(p.contentPayload)}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {editable ? (
                          <Link
                            href={`/scheduled/${encodeURIComponent(p.id)}/edit`}
                            className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          >
                            Edit
                          </Link>
                        ) : null}
                        {needsReconnect ? (
                          <a
                            href={`/api/oauth/${encodeURIComponent(p.platform)}/start`}
                            className={`rounded-md border px-2 py-1 text-xs ${
                              actionBusy
                                ? "pointer-events-none border-zinc-200 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                                : "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                            }`}
                          >
                            Reconnect account
                          </a>
                        ) : null}
                        {retryable ? (
                          <button
                            type="button"
                            onClick={() => void handleRetry(p.id)}
                            disabled={actionBusy}
                            className={`rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
                          >
                            {retryingId === p.id ? "Retrying..." : "Retry"}
                          </button>
                        ) : null}
                        <Link
                          href={`/create?sourcePostId=${encodeURIComponent(p.id)}&mode=duplicate`}
                          className={`rounded-md border px-2 py-1 text-xs ${
                            actionBusy
                              ? "pointer-events-none border-zinc-200 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                              : "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          }`}
                        >
                          Duplicate
                        </Link>
                        <Link
                          href={`/create?sourcePostId=${encodeURIComponent(p.id)}&mode=reschedule`}
                          className={`rounded-md border px-2 py-1 text-xs ${
                            actionBusy
                              ? "pointer-events-none border-zinc-200 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                              : "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          }`}
                        >
                          Reschedule
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleCancel(p.id)}
                          disabled={actionBusy || p.status === "published" || p.status === "processing" || isOverdue}
                          className={`rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
                        >
                          {cancellingId === p.id ? "Canceling..." : "Cancel"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        </section>
      ) : null}

      {filtered.length > 0 && viewMode === "list" ? (
        <ul className="space-y-3">
          {filtered.map((p) => (
            (() => {
              const scheduledAtMs = new Date(p.scheduledAt).getTime();
              const isOverdue = Number.isFinite(scheduledAtMs) && p.status === "scheduled" && scheduledAtMs <= nowMs;
              const failure = mapFailureDetails(p);
              const retryable = p.status === "failed" && isRetryableErrorCode(p.errorCode);
              const editable = p.status === "scheduled";
              const needsReconnect = isNeedsReconnect(p);
              const actionBusy = cancellingId === p.id || retryingId === p.id;
              return (
                <li
                  key={p.id}
                  className="promi-card-lift flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 transition-[box-shadow,transform,border-color] duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-start"
                >
                  <div className="relative mx-auto aspect-square w-16 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800 sm:mx-0">
                    {p.imageUrl ? (
                      <Image src={p.imageUrl} alt={p.productName} fill className="object-cover" sizes="64px" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{p.productName}</h2>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClassName(p.status, isOverdue)}`}
                        aria-label={`Post status: ${getPostStatusCopy(p.status, { isOverdue }).label}`}
                      >
                        {getPostStatusCopy(p.status, { isOverdue }).label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                        {platformLabel(p.platform)}
                      </span>
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
                    {isOverdue ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {getPostStatusCopy("scheduled", { isOverdue: true }).description}
                      </p>
                    ) : null}
                    {p.status === "processing" ? (
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {getPostStatusCopy("processing").description} {getPostStatusCopy("processing").actionHint}
                      </p>
                    ) : null}
                    {failure ? (
                      <div className="space-y-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 dark:border-red-900/40 dark:bg-red-950/30">
                        <p className="text-xs font-semibold text-red-700 dark:text-red-300">{failureLabel(failure.kind)}</p>
                        <p className="text-xs text-red-700 dark:text-red-300">{failure.message}</p>
                      </div>
                    ) : null}
                    {retryable ? (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {getPostStatusCopy("failed").actionHint}
                      </p>
                    ) : null}
                    {needsReconnect ? (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {getPostStatusCopy("needs_reconnect").actionHint}
                      </p>
                    ) : null}
                    {p.lastAttemptAt ? (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Last attempt: {formatAttemptAt(p.lastAttemptAt) ?? "Unknown"}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:flex-col sm:items-stretch">
                    {editable ? (
                      <Link
                        href={`/scheduled/${encodeURIComponent(p.id)}/edit`}
                        className={`promi-press inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-[background-color,box-shadow,transform,color] duration-200 ease-out sm:flex-none ${
                          actionBusy
                            ? "pointer-events-none border-zinc-200 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                            : "border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                        }`}
                      >
                        Edit
                      </Link>
                    ) : null}
                    {needsReconnect ? (
                      <a
                        href={`/api/oauth/${encodeURIComponent(p.platform)}/start`}
                        className={`promi-press inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-[background-color,box-shadow,transform,color] duration-200 ease-out sm:flex-none ${
                          actionBusy
                            ? "pointer-events-none border-zinc-200 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                            : "border-zinc-200 text-zinc-700 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-amber-900/50 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
                        }`}
                      >
                        Reconnect account
                      </a>
                    ) : null}
                    {retryable ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleRetry(p.id)}
                          disabled={actionBusy}
                          className="promi-press inline-flex flex-1 items-center justify-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 sm:flex-none"
                        >
                          {retryingId === p.id ? "Retrying..." : "Retry"}
                        </button>
                      </>
                    ) : null}
                    {failure?.kind === "plan" ? (
                      <Link
                        href="/upgrade"
                        className={`promi-press inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-[background-color,box-shadow,transform,color] duration-200 ease-out sm:flex-none ${
                          actionBusy
                            ? "pointer-events-none border-zinc-200 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                            : "border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                        }`}
                      >
                        Upgrade to Pro
                      </Link>
                    ) : null}
                    <Link
                      href={`/create?sourcePostId=${encodeURIComponent(p.id)}&mode=duplicate`}
                      className={`promi-press inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-[background-color,box-shadow,transform,color] duration-200 ease-out sm:flex-none ${
                        actionBusy
                          ? "pointer-events-none border-zinc-200 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                          : "border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                      }`}
                    >
                      Duplicate
                    </Link>
                    <Link
                      href={`/create?sourcePostId=${encodeURIComponent(p.id)}&mode=reschedule`}
                      className={`promi-press inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-[background-color,box-shadow,transform,color] duration-200 ease-out sm:flex-none ${
                        actionBusy
                          ? "pointer-events-none border-zinc-200 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                          : "border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                      }`}
                    >
                      Reschedule
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleCancel(p.id)}
                      disabled={actionBusy || p.status === "cancelled" || p.status === "published" || p.status === "processing" || isOverdue}
                      className="promi-press inline-flex flex-1 items-center justify-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-red-200/80 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-900/50 dark:hover:bg-red-950/40 dark:hover:text-red-300 sm:flex-none"
                    >
                      {cancellingId === p.id ? "Canceling..." : "Cancel"}
                    </button>
                  </div>
                </li>
              );
            })()
          ))}
        </ul>
      ) : null}
    </section>
  );
}

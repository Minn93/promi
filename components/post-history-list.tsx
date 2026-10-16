"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getPostStatusCopy } from "@/lib/post-status-copy";
import { publishPlatformBadgeLabel } from "@/lib/publish-platform-copy";
import { historyViewOnXUrl, presentHistoryEvent } from "@/lib/history-event-copy";
import { saveReusableTemplateFromScheduledPostId } from "@/lib/reusable-post-templates-storage";
import { toUserFacingError } from "@/lib/user-facing-error";

type PostHistoryItem = {
  id: string;
  scheduledPostId: string;
  eventType: "scheduled" | "picked_up" | "published" | "failed" | "cancelled" | "retried";
  status: "scheduled" | "processing" | "published" | "failed" | "needs_reconnect" | "cancelled" | null;
  platform: "x" | "instagram" | "facebook" | null;
  channel: string | null;
  message: string | null;
  createdAt: string;
  productName: string;
  providerUrl: string | null;
};

const REFRESH_EVENT = "promi:scheduled-posts-updated";
/** Each poll hits the database; keep this modest and pause while the tab is hidden. */
const POLL_INTERVAL_MS = 15000;
const RESUME_REFRESH_DEDUPE_MS = 2000;
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500/40 dark:focus-visible:ring-offset-zinc-950";

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown time";
  return dateTimeFormatter.format(d);
}

function eventBadgeClassName(badge: string, reconnect: boolean): string {
  if (badge === "Published" || badge === "Test publish") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (reconnect) return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
  if (badge === "Failed") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (badge === "Cancelled") return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  if (badge === "Retried" || badge === "Updated") return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function campaignLabel(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  return trimmed || "Untitled post";
}

function canReschedule(status: PostHistoryItem["status"]): boolean {
  return status === "published" || status === "failed";
}

type StatusFilter = "all" | "scheduled" | "processing" | "published" | "failed" | "needs_reconnect" | "cancelled";
type PlatformFilter = "all" | "x" | "instagram" | "facebook";
type SortOrder = "newest" | "oldest";
type HistoryFailureKind = "auth" | "validation" | "plan" | "temporary" | "publish" | "unknown";
const UI_STATE_KEY = "promi:history-ui:v1";

function mapHistoryFailure(message: string | null): { kind: HistoryFailureKind; message: string } | null {
  if (!message) return null;
  const normalized = message.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("auth") || normalized.includes("token") || normalized.includes("forbidden") || normalized.includes("revoked")) {
    return { kind: "auth", message: "Account authorization failed. Reconnect and retry." };
  }
  if (normalized.includes("limit") || normalized.includes("credit") || normalized.includes("plan")) {
    return { kind: "plan", message: "Plan or credit limits blocked publishing." };
  }
  if (normalized.includes("validation") || normalized.includes("too long") || normalized.includes("image") || normalized.includes("5mb")) {
    return { kind: "validation", message: "Post content needs updates before it can publish." };
  }
  if (normalized.includes("rate limit") || normalized.includes("unavailable") || normalized.includes("timeout")) {
    return { kind: "temporary", message: "The platform was temporarily unavailable." };
  }
  if (normalized.includes("publish")) {
    return { kind: "publish", message: "Publishing failed on the platform." };
  }
  return { kind: "unknown", message };
}

function failureKindLabel(kind: HistoryFailureKind): string {
  if (kind === "auth") return "Connection issue";
  if (kind === "validation") return "Validation issue";
  if (kind === "plan") return "Plan limit";
  if (kind === "temporary") return "Temporary issue";
  if (kind === "publish") return "Publish failure";
  return "Unknown issue";
}

export function PostHistoryList() {
  const [items, setItems] = useState<PostHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [query, setQuery] = useState("");
  const [announceFilterResults, setAnnounceFilterResults] = useState(false);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const templateNoticeRef = useRef<HTMLDivElement | null>(null);

  // Errors are only cleared on success so a failing poll keeps the same message instead of flickering.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/post-history?limit=200", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { data?: PostHistoryItem[]; error?: string; code?: string } | null;
      if (!res.ok) {
        const mapped = toUserFacingError(body?.code ?? null, body?.error ?? "Could not load post history.");
        setError(mapped.message);
        setErrorCode(body?.code ?? null);
        return;
      }
      setItems(Array.isArray(body?.data) ? body.data : []);
      setError(null);
      setErrorCode(null);
    } catch {
      setError("Could not load post history.");
      setErrorCode(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleReload = useCallback(async () => {
    setReloading(true);
    await refresh();
    setReloading(false);
  }, [refresh]);

  useEffect(() => {
    void refresh();

    let intervalId: number | undefined;
    let lastResumeRefreshAt = 0;
    const startPolling = () => {
      if (intervalId !== undefined) return;
      intervalId = window.setInterval(() => {
        void refresh();
      }, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (intervalId === undefined) return;
      window.clearInterval(intervalId);
      intervalId = undefined;
    };
    // Tab return fires both visibilitychange and focus; refresh once.
    const refreshOnResume = () => {
      const now = Date.now();
      if (now - lastResumeRefreshAt < RESUME_REFRESH_DEDUPE_MS) return;
      lastResumeRefreshAt = now;
      void refresh();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
        return;
      }
      refreshOnResume();
      stopPolling();
      startPolling();
    };
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      refreshOnResume();
    };
    const onUpdated = () => {
      void refresh();
    };

    if (document.visibilityState !== "hidden") startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener(REFRESH_EVENT, onUpdated);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(REFRESH_EVENT, onUpdated);
    };
  }, [refresh]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(UI_STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        statusFilter?: StatusFilter;
        platformFilter?: PlatformFilter;
        sortOrder?: SortOrder;
        query?: string;
      };
      if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
      if (parsed.platformFilter) setPlatformFilter(parsed.platformFilter);
      if (parsed.sortOrder) setSortOrder(parsed.sortOrder);
      if (typeof parsed.query === "string") setQuery(parsed.query);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        UI_STATE_KEY,
        JSON.stringify({ statusFilter, platformFilter, sortOrder, query }),
      );
    } catch {
      // non-blocking
    }
  }, [statusFilter, platformFilter, sortOrder, query]);

  useEffect(() => {
    if (templateNotice && templateNoticeRef.current) {
      templateNoticeRef.current.focus();
    }
  }, [templateNotice]);

  useEffect(() => {
    if (!announceFilterResults) return;
    const timeoutId = window.setTimeout(() => {
      setAnnounceFilterResults(false);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [announceFilterResults, statusFilter, platformFilter, sortOrder, query]);

  const handleSaveTemplate = async (scheduledPostId: string) => {
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
  };

  if (loading) {
    return (
      <div
        className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
        role="status"
        aria-live="polite"
      >
        Loading history…
      </div>
    );
  }

  if (items.length === 0 && error) {
    const details = toUserFacingError(errorCode, error);
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/40 dark:bg-red-950/30">
        <p className="text-sm font-medium text-red-700 dark:text-red-300" role="alert">
          Couldn&apos;t load history.
        </p>
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">{details.message}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void handleReload()}
            disabled={reloading}
            className={`rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-950/50 ${FOCUS_RING}`}
          >
            {reloading ? "Retrying…" : "Retry"}
          </button>
          {details.actions.map((action) => (
            <Link
              key={`${action.href}-${action.label}`}
              href={action.href}
              className="text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No history yet. Publishing updates appear here once posts start running.
        </p>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Results appear after Promi&apos;s publishing job processes a post, which can be later than the scheduled time.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/create"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create post
          </Link>
        </div>
      </div>
    );
  }

  const visibleItems = items.filter((item) => item.eventType !== "picked_up");
  const filtered = visibleItems
    .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
    .filter((item) => (platformFilter === "all" ? true : item.platform === platformFilter))
    .filter((item) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const event = presentHistoryEvent(item);
      const platformText = item.platform ? publishPlatformBadgeLabel(item.platform) : "";
      return [
        campaignLabel(item.productName),
        item.scheduledPostId,
        item.message ?? "",
        platformText,
        event.badge,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      const aMs = new Date(a.createdAt).getTime();
      const bMs = new Date(b.createdAt).getTime();
      if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
      return sortOrder === "newest" ? bMs - aMs : aMs - bMs;
    });
  const historyErrorDetails = error ? toUserFacingError(errorCode, error) : null;

  return (
    <section aria-label="Post history controls and results" className="space-y-3">
      {error ? (
        <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            {historyErrorDetails?.message ?? error}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleReload()}
              disabled={reloading}
              className={`rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50 ${FOCUS_RING}`}
            >
              {reloading ? "Retrying…" : "Retry"}
            </button>
            {historyErrorDetails?.actions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className="text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {templateNotice ? (
        <div
          ref={templateNoticeRef}
          tabIndex={-1}
          className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
          role="status"
          aria-live="polite"
        >
          <p>{templateNotice}</p>
          {savedTemplateId ? (
            <Link
              href={`/create?templateId=${encodeURIComponent(savedTemplateId)}`}
              className="text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100"
            >
              Use template
            </Link>
          ) : null}
          {templateNotice.toLowerCase().includes("limit") ? (
            <Link href="/upgrade" className="text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
              Upgrade
            </Link>
          ) : null}
        </div>
      ) : null}
      <fieldset className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <legend className="sr-only">Post history filters</legend>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAnnounceFilterResults(true);
          }}
          placeholder="Search campaign, post ID, or platform"
          className="w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-500 sm:min-w-[220px] sm:flex-1"
          aria-label="Search post history"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setAnnounceFilterResults(true);
          }}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          aria-label="Filter history by status"
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
          aria-label="Filter history by platform"
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
          aria-label="Sort history"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </fieldset>
      <p
        className="text-xs text-zinc-500 dark:text-zinc-400"
        role={announceFilterResults ? "status" : undefined}
        aria-live={announceFilterResults ? "polite" : undefined}
        aria-atomic={announceFilterResults || undefined}
      >
        Showing {filtered.length.toLocaleString()} of {visibleItems.length.toLocaleString()} history entries
      </p>
      {filtered.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
          role="status"
          aria-live="polite"
        >
          {query.trim()
            ? "No history entries match your search and filters."
            : "No history entries match the current filters."}
          <div className="mt-2 flex flex-wrap items-center gap-3">
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
              href="/scheduled"
              className="text-xs font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300"
            >
              View scheduled posts
            </Link>
          </div>
        </div>
      ) : null}
      <ul className="space-y-2">
        {filtered.map((item) => {
          const event = presentHistoryEvent(item);
          const failure = item.eventType === "failed" && !event.reconnect
            ? (mapHistoryFailure(item.message) ?? { kind: "unknown" as const, message: "Publishing failed for an unknown reason." })
            : null;
          const statusCopy = getPostStatusCopy(item.status);
          const viewOnX = historyViewOnXUrl(item);
          const name = campaignLabel(item.productName);
          return (
            <li
              key={item.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 text-base font-semibold text-zinc-900 dark:text-zinc-50">{name}</h2>
                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${eventBadgeClassName(event.badge, event.reconnect)}`}
                >
                  {event.badge}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatAt(item.createdAt)}</p>
              {event.supporting ? (
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">{event.supporting}</p>
              ) : null}
              {failure ? (
                <div className="mt-2 space-y-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 dark:border-red-900/40 dark:bg-red-950/30">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                    {failureKindLabel(failure.kind)}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300">{failure.message}</p>
                </div>
              ) : null}
              <p className="mt-2 max-w-full truncate text-xs text-zinc-500 dark:text-zinc-400" title={item.scheduledPostId}>
                Post ID: {item.scheduledPostId}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Platform: {item.platform ? publishPlatformBadgeLabel(item.platform) : "Not available"}
                <span className="mx-1.5 text-zinc-300 dark:text-zinc-600" aria-hidden="true">·</span>
                <span>Current status: {statusCopy.label}</span>
              </p>
              {item.channel ? (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Channel: {item.channel}</p>
              ) : null}
              <div className="mt-3 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
                {viewOnX ? (
                  <a
                    href={viewOnX}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
                  >
                    View on X
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleSaveTemplate(item.scheduledPostId)}
                  disabled={savingTemplateId === item.scheduledPostId}
                  className={`promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
                >
                  {savingTemplateId === item.scheduledPostId ? "Saving…" : "Save as template"}
                </button>
                <Link
                  href={`/create?sourcePostId=${encodeURIComponent(item.scheduledPostId)}&mode=duplicate`}
                  className={`promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
                >
                  Duplicate
                </Link>
                {canReschedule(item.status) ? (
                  <Link
                    href={`/create?sourcePostId=${encodeURIComponent(item.scheduledPostId)}&mode=reschedule`}
                    className={`promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
                  >
                    Reschedule
                  </Link>
                ) : null}
                {event.reconnect && item.platform ? (
                  <a
                    href={`/api/oauth/${encodeURIComponent(item.platform)}/start`}
                    className={`promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-amber-900/50 dark:hover:bg-amber-950/40 dark:hover:text-amber-300 ${FOCUS_RING}`}
                  >
                    Reconnect account
                  </a>
                ) : null}
                {failure?.kind === "validation" ? (
                  <Link
                    href={`/scheduled/${encodeURIComponent(item.scheduledPostId)}/edit`}
                    className={`promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
                  >
                    Edit post
                  </Link>
                ) : null}
                {failure?.kind === "plan" ? (
                  <Link
                    href="/upgrade"
                    className={`promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
                  >
                    Upgrade
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

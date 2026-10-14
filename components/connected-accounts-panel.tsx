"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getClientPlanTier, getPlanConfig } from "@/src/lib/plans/config";

type Platform = "x" | "instagram" | "facebook";
type AccountStatus = "active" | "expired" | "revoked" | "error";

type ConnectedAccount = {
  id: string;
  platform: Platform;
  status: AccountStatus;
  displayName: string | null;
  externalAccountId: string | null;
  updatedAt: string;
};
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500/40 dark:focus-visible:ring-offset-zinc-950";

const PLATFORM_LABELS: Record<Platform, string> = {
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
};

/** "revoked" is written by a user-initiated disconnect, so it reads as disconnected, not as a broken connection. */
function needsReconnect(status: AccountStatus): boolean {
  return status === "expired" || status === "error";
}

function statusClassName(status: AccountStatus) {
  if (status === "active") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "expired") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "error") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function statusLabel(status: AccountStatus) {
  if (status === "active") return "Connected";
  if (needsReconnect(status)) return "Needs reconnect";
  return "Disconnected";
}

function statusHint(status: AccountStatus, platformLabel: string): string {
  if (status === "active") return "Ready for scheduled publishing.";
  if (status === "expired") return "Session expired. Reconnect to resume publishing.";
  if (status === "error") return "Connection check failed. Reconnect and try again.";
  return `This ${platformLabel} account is no longer connected.`;
}

function normalizeErrorMessage(code: string | null, message: string): string {
  if (code?.startsWith("PLAN_LIMIT_")) return "Plan limit reached. Disconnect an account or upgrade.";
  if (code === "INVALID_INPUT" || code === "INVALID_JSON") return "We could not process this request. Try again.";
  return message;
}

type OAuthNotice = { tone: "success" | "error"; message: string };

function isPlatform(value: string | null): value is Platform {
  return value === "x" || value === "instagram" || value === "facebook";
}

function oauthNoticeFromParams(
  connected: string | null,
  oauthError: string | null,
  mock: boolean,
): OAuthNotice | null {
  if (oauthError) {
    if (oauthError === "account_unavailable") {
      return {
        tone: "error",
        message: "Couldn't connect the account: this Promi account is currently unavailable. Contact Promi support if this seems wrong.",
      };
    }
    if (oauthError === "email_verification_required") {
      return {
        tone: "error",
        message: "Verify your email address before connecting this account, then try connecting again.",
      };
    }
    return { tone: "error", message: "Couldn't finish connecting the account. Please try connecting again." };
  }
  if (connected) {
    const label = isPlatform(connected) ? PLATFORM_LABELS[connected] : "Account";
    if (mock) {
      return {
        tone: "success",
        message: `${label} connected in test mode. Real publishing isn't available for this platform yet.`,
      };
    }
    return { tone: "success", message: `${label} connected. Scheduled posts can now publish to this account.` };
  }
  return null;
}

type ConnectedAccountsPanelProps = {
  oauthConnected?: string | null;
  oauthError?: string | null;
  oauthMock?: boolean;
};

export function ConnectedAccountsPanel({
  oauthConnected = null,
  oauthError = null,
  oauthMock = false,
}: ConnectedAccountsPanelProps = {}) {
  const [items, setItems] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<OAuthNotice | null>(() =>
    oauthNoticeFromParams(oauthConnected, oauthError, oauthMock),
  );
  const planTier = getClientPlanTier();
  const plan = getPlanConfig(planTier);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/connected-accounts", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { data?: ConnectedAccount[]; error?: string; code?: string } | null;
      if (!res.ok) {
        setLoadError(normalizeErrorMessage(body?.code ?? null, body?.error ?? "Could not load connected accounts."));
        return;
      }
      setItems(Array.isArray(body?.data) ? body.data : []);
      setLoadError(null);
    } catch {
      setLoadError("Could not load connected accounts.");
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
  }, [refresh]);

  // Strip one-shot OAuth result params so a page reload doesn't repeat the notice.
  useEffect(() => {
    if (!oauthConnected && !oauthError) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    url.searchParams.delete("oauth_error");
    url.searchParams.delete("mock");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [oauthConnected, oauthError]);

  const grouped = useMemo(() => {
    const map: Record<Platform, ConnectedAccount | null> = {
      x: null,
      instagram: null,
      facebook: null,
    };
    for (const item of items) {
      const current = map[item.platform];
      if (!current || (current.status !== "active" && item.status === "active")) {
        map[item.platform] = item;
      }
    }
    return map;
  }, [items]);
  const activeAccountsCount = useMemo(
    () => items.filter((item) => item.status !== "revoked").length,
    [items],
  );
  const atLimit = activeAccountsCount >= plan.limits.connectedAccounts;

  const handleDisconnect = async (accountId: string) => {
    if (!window.confirm("Disconnect this account? Scheduled posts may fail until it is reconnected.")) return;
    setBusyId(accountId);
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch("/api/connected-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, action: "disconnect" }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Could not disconnect account.");
        setErrorCode(body?.code ?? null);
        return;
      }
      await refresh();
    } catch {
      setError("Could not disconnect account.");
      setErrorCode(null);
    } finally {
      setBusyId(null);
    }
  };

  const oauthNoticeBanner = oauthNotice ? (
    <div
      className={`flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
        oauthNotice.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
          : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
      }`}
      role={oauthNotice.tone === "success" ? "status" : "alert"}
    >
      <p className="text-sm">{oauthNotice.message}</p>
      <button
        type="button"
        onClick={() => setOauthNotice(null)}
        className={`self-start rounded-md px-2 py-1 text-xs font-medium underline underline-offset-2 sm:self-auto ${FOCUS_RING}`}
      >
        Dismiss
      </button>
    </div>
  ) : null;

  const reloadButton = (
    <button
      type="button"
      onClick={() => void handleReload()}
      disabled={reloading}
      className={`rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-950/50 ${FOCUS_RING}`}
    >
      {reloading ? "Retrying…" : "Retry"}
    </button>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {oauthNoticeBanner}
        <div
          className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
          role="status"
          aria-live="polite"
        >
          Loading connected accounts…
        </div>
      </div>
    );
  }

  if (loadError && items.length === 0) {
    return (
      <div className="space-y-4">
        {oauthNoticeBanner}
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/40 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-700 dark:text-red-300" role="alert">
            Couldn&apos;t load connected accounts.
          </p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">{loadError}</p>
          <div className="mt-4 flex justify-center">{reloadButton}</div>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Connected account panels and actions" className="space-y-4">
      {oauthNoticeBanner}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
        Plan: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{plan.label}</span> · Connected accounts:{" "}
        {activeAccountsCount}/{plan.limits.connectedAccounts}
        {planTier === "free" ? (
          <>
            {" "}· Need more account slots?{" "}
            <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
              Upgrade
            </Link>
          </>
        ) : null}
      </div>
      {loadError ? (
        <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            Couldn&apos;t refresh connected accounts. {loadError}
          </p>
          <div className="shrink-0">{reloadButton}</div>
        </div>
      ) : null}
      {error ? (
        <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            {normalizeErrorMessage(errorCode, error)}
          </p>
          {errorCode?.startsWith("PLAN_LIMIT_") ? (
            <Link href="/upgrade" className="text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
              Upgrade
            </Link>
          ) : null}
        </div>
      ) : null}
      {(["x", "instagram", "facebook"] as Platform[]).map((platform) => {
        const account = grouped[platform];
        const connectHref = `/api/oauth/${platform}/start`;
        const platformLabel = PLATFORM_LABELS[platform];
        const isDisconnected = account?.status === "revoked";
        const accountNeedsReconnect = Boolean(account && needsReconnect(account.status));
        const connectLocked = (!account || isDisconnected) && atLimit;
        const platformBusy = busyId === account?.id;
        const connectLabel = !account
          ? "Connect"
          : account.status === "active"
            ? "Connect another"
            : accountNeedsReconnect
              ? `Reconnect ${platformLabel}`
              : `Connect ${platformLabel}`;
        return (
          <section
            key={platform}
            aria-labelledby={`connected-account-${platform}-heading`}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`connected-account-${platform}-heading`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{PLATFORM_LABELS[platform]}</h3>
              {account ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClassName(account.status)}`}
                  aria-label={`Account status: ${statusLabel(account.status)}`}
                >
                  {statusLabel(account.status)}
                </span>
              ) : (
                <span
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  aria-label="Account status: Not connected"
                >
                  Not connected
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {account
                ? `${account.displayName ?? account.externalAccountId ?? "Connected account"}`
                : "No account connected yet."}
            </p>
            {account ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{statusHint(account.status, platformLabel)}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={connectLocked || platformBusy ? undefined : connectHref}
                aria-disabled={connectLocked || platformBusy}
                className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium ${FOCUS_RING} ${
                  connectLocked || platformBusy
                    ? "cursor-not-allowed border border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                    : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                }`}
              >
                {connectLabel}
              </a>
              {account && !isDisconnected ? (
                <button
                  type="button"
                  onClick={() => void handleDisconnect(account.id)}
                  disabled={platformBusy}
                  className={`inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-900/50 dark:hover:bg-red-950/40 dark:hover:text-red-300 ${FOCUS_RING}`}
                >
                  {platformBusy ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : null}
            </div>
            {connectLocked ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <p>{plan.label} plan limit reached. Disconnect an account or upgrade.</p>
                <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
                  Upgrade
                </Link>
              </div>
            ) : null}
          </section>
        );
      })}
      {activeAccountsCount === 0 ? (
        <section className="rounded-lg border border-dashed border-zinc-200 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-zinc-700 dark:text-zinc-300">
            Connected accounts let Promi publish and retry your scheduled posts. During the beta, only X posts are published for real.
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Start with X, which supports publishing today.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="/api/oauth/x/start"
              className={`inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 ${FOCUS_RING}`}
            >
              Connect your first account
            </a>
          </div>
        </section>
      ) : null}
    </section>
  );
}

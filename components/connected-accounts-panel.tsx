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

function statusClassName(status: AccountStatus) {
  if (status === "active") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "expired") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "error") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
}

function statusLabel(status: AccountStatus) {
  if (status === "active") return "Active";
  if (status === "expired") return "Needs reconnect";
  if (status === "error") return "Connection issue";
  return "Needs reconnect";
}

function statusHint(status: AccountStatus): string {
  if (status === "active") return "Ready for scheduled publishing.";
  if (status === "expired") return "Session expired. Reconnect to resume publishing.";
  if (status === "revoked") return "Access was revoked. Reconnect to continue.";
  return "Connection check failed. Reconnect and try again.";
}

function normalizeErrorMessage(code: string | null, message: string): string {
  if (code?.startsWith("PLAN_LIMIT_")) return "Plan limit reached. Disconnect an account or upgrade.";
  if (code === "INVALID_INPUT" || code === "INVALID_JSON") return "We could not process this request. Try again.";
  return message;
}

export function ConnectedAccountsPanel() {
  const [items, setItems] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const planTier = getClientPlanTier();
  const plan = getPlanConfig(planTier);

  const refresh = useCallback(async () => {
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch("/api/connected-accounts", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { data?: ConnectedAccount[]; error?: string; code?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Could not load connected accounts.");
        setErrorCode(body?.code ?? null);
        return;
      }
      setItems(Array.isArray(body?.data) ? body.data : []);
    } catch {
      setError("Could not load connected accounts.");
      setErrorCode(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grouped = useMemo(() => {
    const map: Record<Platform, ConnectedAccount | null> = {
      x: null,
      instagram: null,
      facebook: null,
    };
    for (const item of items) {
      if (!map[item.platform]) {
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

  if (loading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">
        Loading connected accounts...
      </p>
    );
  }

  return (
    <section aria-label="Connected account panels and actions" className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
        Plan: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{plan.label}</span> · Connected accounts:{" "}
        {activeAccountsCount}/{plan.limits.connectedAccounts}
        {planTier === "free" ? " · Upgrade to Pro for more account slots." : ""}
        {planTier === "free" ? (
          <>
            {" "}
            <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
              Upgrade to Pro
            </Link>
          </>
        ) : null}
      </div>
      {error ? (
        <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            {normalizeErrorMessage(errorCode, error)}
          </p>
          {errorCode?.startsWith("PLAN_LIMIT_") ? (
            <Link href="/upgrade" className="text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
              Upgrade to Pro
            </Link>
          ) : null}
        </div>
      ) : null}
      {(["x", "instagram", "facebook"] as Platform[]).map((platform) => {
        const account = grouped[platform];
        const connectHref = `/api/oauth/${platform}/start`;
        const needsReconnect = account && account.status !== "active";
        const connectLocked = !account && atLimit;
        const platformBusy = busyId === account?.id;
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
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{statusHint(account.status)}</p>
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
                {platformBusy
                  ? account && needsReconnect
                    ? "Reconnecting..."
                    : "Connecting..."
                  : account
                    ? (needsReconnect ? "Reconnect account" : "Connect new")
                    : "Connect"}
              </a>
              {account ? (
                <button
                  type="button"
                  onClick={() => void handleDisconnect(account.id)}
                  disabled={platformBusy}
                  className={`inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-900/50 dark:hover:bg-red-950/40 dark:hover:text-red-300 ${FOCUS_RING}`}
                >
                  {platformBusy ? "Disconnecting..." : "Disconnect"}
                </button>
              ) : null}
            </div>
            {connectLocked ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <p>Free plan limit reached. Disconnect an account or upgrade to Pro.</p>
                <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
                  Upgrade to Pro
                </Link>
              </div>
            ) : null}
          </section>
        );
      })}
      {activeAccountsCount === 0 ? (
        <section className="rounded-lg border border-dashed border-zinc-200 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-zinc-700 dark:text-zinc-300">
            Connected accounts let Promi publish and retry scheduled posts automatically.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="/api/oauth/instagram/start"
              className={`inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 ${FOCUS_RING}`}
            >
              Connect your first account
            </a>
            <Link
              href="/create"
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Create first post
            </Link>
          </div>
        </section>
      ) : null}
    </section>
  );
}

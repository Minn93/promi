"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ConnectedAccountsPanel } from "@/components/connected-accounts-panel";
import { readReusablePostTemplates } from "@/lib/reusable-post-templates-storage";
import { readClientBillingState } from "@/src/lib/billing/client";
import { PLAN_CONFIG, getClientPlanTier, getPlanConfig, limitLabel, type PlanTier } from "@/src/lib/plans/config";

type ConnectedAccount = {
  status: "active" | "expired" | "revoked" | "error";
};

type SettingsPageContentProps = {
  ownerId: string;
  planTier: PlanTier;
};

type Preferences = {
  timezone: string;
  defaultPlatform: "instagram" | "x" | "facebook";
};

const PREFS_KEY = "promi:preferences:v1";

const DEFAULT_PREFS: Preferences = {
  timezone: "browser",
  defaultPlatform: "instagram",
};

export function SettingsPageContent({ ownerId, planTier }: SettingsPageContentProps) {
  const [effectivePlanTier] = useState<PlanTier>(() => {
    if (typeof window === "undefined") return planTier;
    return getClientPlanTier();
  });
  const [billingStatus] = useState(() => readClientBillingState().status);
  const plan = getPlanConfig(effectivePlanTier);
  const [connectedAccountsUsed, setConnectedAccountsUsed] = useState(0);
  const [activeScheduledPostsUsed, setActiveScheduledPostsUsed] = useState<number | null>(null);
  const [templatesUsed] = useState(() => {
    if (typeof window === "undefined") return 0;
    return readReusablePostTemplates().items.length;
  });
  const [prefs, setPrefs] = useState<Preferences>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return DEFAULT_PREFS;
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      return {
        timezone: typeof parsed.timezone === "string" ? parsed.timezone : DEFAULT_PREFS.timezone,
        defaultPlatform:
          parsed.defaultPlatform === "x" || parsed.defaultPlatform === "facebook" || parsed.defaultPlatform === "instagram"
            ? parsed.defaultPlatform
            : DEFAULT_PREFS.defaultPlatform,
      };
    } catch {
      return DEFAULT_PREFS;
    }
  });
  const [prefNotice, setPrefNotice] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const [accountsRes, scheduledRes] = await Promise.all([
          fetch("/api/connected-accounts", { cache: "no-store" }),
          fetch("/api/scheduled-posts?summary=active_count", { cache: "no-store" }),
        ]);
        const accountsBody = (await accountsRes.json().catch(() => null)) as { data?: ConnectedAccount[] } | null;
        const scheduledBody = (await scheduledRes.json().catch(() => null)) as {
          data?: { activeScheduledPosts?: number };
        } | null;

        const accounts = Array.isArray(accountsBody?.data) ? accountsBody.data : [];
        setConnectedAccountsUsed(accounts.filter((item) => item.status !== "revoked").length);
        const count = scheduledBody?.data?.activeScheduledPosts;
        if (typeof count === "number" && Number.isFinite(count)) setActiveScheduledPostsUsed(count);
      } catch {
        // keep fallback values
      }
    };
    void run();
  }, []);

  const usageRows = useMemo(
    () => [
      {
        label: "Connected accounts",
        used: connectedAccountsUsed,
        limit: plan.limits.connectedAccounts,
      },
      {
        label: "Active scheduled posts",
        used: activeScheduledPostsUsed ?? 0,
        limit: plan.limits.scheduledPostsActive,
      },
      {
        label: "Reusable templates",
        used: templatesUsed,
        limit: plan.limits.reusableTemplates,
      },
    ],
    [connectedAccountsUsed, activeScheduledPostsUsed, templatesUsed, plan.limits],
  );

  const savePrefs = () => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      setPrefNotice("Preferences saved.");
      window.setTimeout(() => setPrefNotice(null), 2200);
    } catch {
      setPrefNotice("Could not save preferences on this browser.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Account overview</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as <span className="font-medium text-zinc-800 dark:text-zinc-100">{ownerId}</span>
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Current plan: <span className="font-medium text-zinc-800 dark:text-zinc-100">{plan.label}</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Billing status: {billingStatus}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {usageRows.map((row) => (
            <div key={row.label} className="rounded-md border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
              <p className="text-zinc-500 dark:text-zinc-400">{row.label}</p>
              <p className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-100">
                {row.label === "Active scheduled posts" && activeScheduledPostsUsed == null
                  ? "..."
                  : `${row.used} / ${limitLabel(row.limit)} used`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Connected accounts</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage social connections for publishing, retries, and reconnect flow.
        </p>
        <div className="mt-4">
          <ConnectedAccountsPanel />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Plan and Pro access</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Free starts small. Higher limits come from Pro enrollment during closed beta via manual approval (no in-app checkout).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(["free", "pro"] as PlanTier[]).map((tier) => {
            const cfg = PLAN_CONFIG[tier];
            return (
              <div key={tier} className="rounded-md border border-zinc-200 px-3 py-3 text-xs dark:border-zinc-800">
                <p className="font-semibold text-zinc-800 dark:text-zinc-100">{cfg.label}</p>
                <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-300">
                  <li>Connected accounts: {limitLabel(cfg.limits.connectedAccounts)}</li>
                  <li>Active scheduled posts: {limitLabel(cfg.limits.scheduledPostsActive)}</li>
                  <li>Reusable templates: {limitLabel(cfg.limits.reusableTemplates)}</li>
                  <li>Advanced analytics: {cfg.features.advancedAnalytics ? "Included" : "Limited"}</li>
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <Link
            href="/upgrade"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Request Pro access
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Preferences</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Set lightweight defaults for how Promi feels on this browser.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Timezone display</span>
            <select
              value={prefs.timezone}
              onChange={(e) => setPrefs((prev) => ({ ...prev, timezone: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <option value="browser">Browser default</option>
              <option value="UTC">UTC</option>
              <option value="Asia/Seoul">Asia/Seoul</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Default platform</span>
            <select
              value={prefs.defaultPlatform}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  defaultPlatform: e.target.value as Preferences["defaultPlatform"],
                }))}
              className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <option value="instagram">Instagram</option>
              <option value="x">X</option>
              <option value="facebook">Facebook</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={savePrefs}
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Save preferences
          </button>
          {prefNotice ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{prefNotice}</p> : null}
        </div>
      </section>
    </div>
  );
}

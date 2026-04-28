"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { readClientBillingState } from "@/src/lib/billing/client";
import { isInternalBetaModeClient } from "@/src/lib/internal-beta-mode";
import { PLAN_CONFIG, limitLabel, type PlanTier } from "@/src/lib/plans/config";

const FEATURE_LABELS: Record<string, string> = {
  advancedAnalytics: "Advanced analytics ranges and insights",
  multiAccount: "Multi-account operations",
  templateReuse: "Reusable template workflows",
  advancedOperations: "Advanced operational controls",
};

function billingStatusLabel(status: string): string {
  if (status === "pro_pending") return "Pro (pending)";
  if (status === "pro") return "Pro";
  if (status === "canceled") return "Canceled";
  return "Free";
}

export function UpgradePricingFlow() {
  const internalBetaMode = isInternalBetaModeClient();
  const productionEnvironment = process.env.NODE_ENV === "production";
  const [billingStatus] = useState<"free" | "pro_pending" | "pro" | "canceled">(
    () => readClientBillingState().status,
  );

  const cta = useMemo(() => {
    if (billingStatus === "pro") {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            Active: Pro
          </span>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Manage settings
          </Link>
        </div>
      );
    }

    const checkoutLabel = billingStatus === "pro_pending" ? "Continue checkout" : "Upgrade to Pro";
    return (
      <div className="flex flex-wrap items-center gap-2">
        {productionEnvironment ? (
          <span className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            Checkout disabled in production (simulated billing only)
          </span>
        ) : (
          <Link
            href="/upgrade/checkout"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {checkoutLabel}
          </Link>
        )}
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }, [billingStatus, productionEnvironment]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Current billing state: <span className="font-medium text-zinc-800 dark:text-zinc-100">{billingStatusLabel(billingStatus)}</span>
        </p>
        {internalBetaMode ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Internal beta mode: billing actions are simulated. No real payments are processed.
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {(["free", "pro"] as PlanTier[]).map((tier) => {
          const plan = PLAN_CONFIG[tier];
          return (
            <article key={tier} className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{plan.label}</h2>
              <ul className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                <li>Connected accounts: {limitLabel(plan.limits.connectedAccounts)}</li>
                <li>Active scheduled posts: {limitLabel(plan.limits.scheduledPostsActive)}</li>
                <li>Reusable templates: {limitLabel(plan.limits.reusableTemplates)}</li>
                <li>Analytics range: up to {limitLabel(plan.limits.analyticsMaxDays)} days</li>
              </ul>
              <ul className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                {Object.entries(plan.features).map(([featureKey, enabled]) => (
                  <li key={featureKey}>
                    {enabled ? "Included" : "Limited"} - {FEATURE_LABELS[featureKey] ?? featureKey}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Ready to upgrade?</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pro removes most limits and unlocks advanced workflows for daily operations.
        </p>
        <div className="mt-4">{cta}</div>
      </section>
    </div>
  );
}

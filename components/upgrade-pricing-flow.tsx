"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { isInternalBetaModeClient } from "@/src/lib/internal-beta-mode";
import { PLAN_CONFIG, limitLabel, type PlanTier } from "@/src/lib/plans/config";

import type { OwnerEntitlementDisplay } from "@/src/lib/entitlements/display-types";

const FEATURE_LABELS: Record<string, string> = {
  advancedAnalytics: "Advanced analytics ranges and insights",
  multiAccount: "Multi-account operations",
  templateReuse: "Reusable template workflows",
  advancedOperations: "Extra publishing controls",
};

function entitlementExpired(expiresAtIso: string | null): boolean {
  if (!expiresAtIso) return false;
  const t = new Date(expiresAtIso).getTime();
  return !Number.isNaN(t) && t <= Date.now();
}

/** Matches server entitlement “active-ish” tiers for framing copy only. */
function isDisplayedEntitlementManualPro(row: OwnerEntitlementDisplay): boolean {
  if (entitlementExpired(row.expiresAtIso)) return false;
  const tier = row.planTier.trim().toLowerCase();
  if (tier !== "pro") return false;
  const source = row.source.trim().toLowerCase();
  if (source !== "manual") return false;
  const st = row.status.trim().toLowerCase();
  return st === "active" || st === "manual";
}

const PROVIDER_ENTITLEMENT_SOURCES = new Set(["provider", "stripe"]);

/** Provider-billed Pro (webhook → owner_entitlements); display-only — aligns with resolver active/trialing/past_due. */
function isDisplayedEntitlementProviderPro(row: OwnerEntitlementDisplay): boolean {
  if (entitlementExpired(row.expiresAtIso)) return false;
  const tier = row.planTier.trim().toLowerCase();
  if (tier !== "pro") return false;
  if (!PROVIDER_ENTITLEMENT_SOURCES.has(row.source.trim().toLowerCase())) return false;
  const st = row.status.trim().toLowerCase();
  return st === "active" || st === "trialing" || st === "past_due";
}

export type UpgradePricingFlowProps = {
  ownerId: string;
  resolvedPlanTier: PlanTier;
  entitlement: OwnerEntitlementDisplay | null;
  upgradeRequestEmail?: string;
  showDevMockPlayground: boolean;
  /** Server-derived: billing flags + Stripe key + price id + canonical app URL (never trust client env alone). */
  offerStripeHostedCheckout: boolean;
  checkoutReturn: "success" | "cancelled" | null;
};

export function UpgradePricingFlow({
  ownerId,
  resolvedPlanTier,
  entitlement,
  upgradeRequestEmail,
  showDevMockPlayground,
  offerStripeHostedCheckout,
  checkoutReturn,
}: UpgradePricingFlowProps) {
  const internalBetaMode = isInternalBetaModeClient();
  const productionEnvironment = process.env.NODE_ENV === "production";

  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeErr, setStripeErr] = useState<string | null>(null);

  const manualProGranted =
    resolvedPlanTier === "pro"
    && entitlement != null
    && isDisplayedEntitlementManualPro(entitlement);

  const providerProGranted =
    resolvedPlanTier === "pro"
    && entitlement != null
    && isDisplayedEntitlementProviderPro(entitlement);

  const resolverLabel = resolvedPlanTier === "pro" ? "Pro" : "Free";

  const requestBody = useMemo(
    () =>
      [
        "Hello,",
        "",
        "I'm requesting Promi Pro access during beta.",
        "",
        `Support reference: ${ownerId}`,
        "",
        "Thank you.",
      ].join("\n"),
    [ownerId],
  );

  const mailtoHref = useMemo(() => {
    const to = upgradeRequestEmail?.trim();
    if (!to) return "";
    const subject = encodeURIComponent(`Promi Pro access request — ${ownerId}`);
    const body = encodeURIComponent(requestBody);
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }, [upgradeRequestEmail, ownerId, requestBody]);

  const handleCopyRequest = useCallback(async () => {
    setCopyNotice(null);
    try {
      await navigator.clipboard.writeText(requestBody);
      setCopyNotice("Request text copied. Paste it into an email to Promi support.");
    } catch {
      setCopyNotice("Could not copy automatically. Please try again or email Promi support.");
    }
  }, [requestBody]);

  const handleStripeCheckout = useCallback(async () => {
    setStripeErr(null);
    setStripeBusy(true);
    try {
      const res = await fetch("/api/billing/checkout-session", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        const code = data.error ?? "checkout_failed";
        setStripeErr(
          code === "billing_disabled"
            ? "Checkout is not available right now. You can still request Pro access by email."
            : code === "billing_misconfigured"
              ? "Checkout is temporarily unavailable. Please try again later or request Pro access by email."
              : code === "authentication_required"
                ? "Sign in to continue to checkout."
                : "Could not start checkout. Please try again or request Pro access by email.",
        );
        return;
      }
      if (!data.url) {
        setStripeErr("Checkout could not continue. Please try again.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setStripeErr("Network error starting checkout. Please try again.");
    } finally {
      setStripeBusy(false);
    }
  }, []);

  const currentPlanPanel = (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Current plan & limits
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Your plan:{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{resolverLabel}</span>
      </p>
      {manualProGranted ? (
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
          Pro access is active.
        </p>
      ) : null}
      {providerProGranted ? (
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
          Pro access is active through your subscription.
        </p>
      ) : null}
      {resolvedPlanTier === "pro" && !manualProGranted && !providerProGranted ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Pro limits are currently applied to your account.
        </p>
      ) : null}
      {resolvedPlanTier === "free" ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {offerStripeHostedCheckout
            ? "You are on Free. You can request Pro access or continue to checkout when it is available."
            : "You are on Free. Request Pro access if you need higher limits during beta."}
        </p>
      ) : null}
      {entitlementExpired(entitlement?.expiresAtIso ?? null) ? (
        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          Your previous Pro access has expired. Request Pro again if you need higher limits.
        </p>
      ) : null}
    </section>
  );

  const accessCtas = resolvedPlanTier === "pro"
    ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            Pro active
          </span>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Manage settings
          </Link>
        </div>
      )
    : (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap gap-2">
            {mailtoHref ? (
              <a
                href={mailtoHref}
                className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Upgrade
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void handleCopyRequest()}
                className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Upgrade
              </button>
            )}
            {offerStripeHostedCheckout ? (
              <button
                type="button"
                disabled={stripeBusy}
                onClick={() => void handleStripeCheckout()}
                className="inline-flex items-center justify-center rounded-md border border-emerald-700 bg-white px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-600 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
              >
                {stripeBusy ? "Starting checkout…" : "Continue to checkout"}
              </button>
            ) : null}
          </div>
          {!mailtoHref ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Copy the request text, then email Promi support to ask for Pro access.
            </p>
          ) : null}
          {copyNotice ? <p className="text-xs text-zinc-600 dark:text-zinc-400">{copyNotice}</p> : null}
          {stripeErr ? <p className="text-xs text-amber-800 dark:text-amber-200">{stripeErr}</p> : null}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Back to home
          </Link>
        </div>
      );

  return (
    <div className="space-y-5">
      {currentPlanPanel}

      {checkoutReturn === "success" ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-50">
          Thanks for returning from checkout. Pro access may take a moment to appear — refresh this page shortly.
          Returning here does not by itself mean Pro is active yet.
        </p>
      ) : null}
      {checkoutReturn === "cancelled" ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
          Checkout was cancelled. No changes were made to your plan.
        </p>
      ) : null}

      {internalBetaMode ? (
        <p className="text-xs text-amber-800 dark:text-amber-100/90">
          Promi is in beta. Paid billing is limited, and Pro access may require approval.
        </p>
      ) : null}

      {productionEnvironment && !offerStripeHostedCheckout ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Self-serve checkout is not available yet. You can still request Pro access during beta.
        </p>
      ) : null}
      {productionEnvironment && offerStripeHostedCheckout ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Checkout may open in Stripe. Your plan updates after payment is confirmed — returning to this page alone does not grant Pro.
        </p>
      ) : null}

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
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Need higher limits?</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pro expands connected accounts, scheduled posts, templates, and analytics depth.
          {offerStripeHostedCheckout
            ? " Request Pro access, or continue to checkout when available."
            : " During beta, Pro access is granted after a short request review."}
        </p>
        <div className="mt-4">{accessCtas}</div>
      </section>

      {showDevMockPlayground ? (
        <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-4 text-xs dark:border-amber-800 dark:bg-amber-950/20">
          <p className="font-medium text-amber-900 dark:text-amber-200">Local preview only</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-200/85">
            This preview does not change your real plan. It is available in local development only.
          </p>
          <Link
            href="/upgrade/checkout"
            className="mt-2 inline-flex text-xs font-medium text-amber-900 underline underline-offset-2 dark:text-amber-200"
          >
            Open local preview
          </Link>
        </section>
      ) : null}
    </div>
  );
}
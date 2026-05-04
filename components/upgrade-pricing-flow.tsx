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
  advancedOperations: "Advanced operational controls",
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

  const resolverLabel = resolvedPlanTier === "pro" ? "Pro" : "Free";

  const requestBody = useMemo(
    () =>
      [
        "Hello,",
        "",
        "I'm requesting Promi Pro access during the closed-beta period (manual approval, no payment in-app).",
        "",
        `Owner ID: ${ownerId}`,
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
      setCopyNotice("Request text copied.");
    } catch {
      setCopyNotice("Could not copy automatically. Copy the Owner ID manually.");
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
            ? "Hosted checkout is not enabled for this deployment."
            : code === "billing_misconfigured"
              ? "Billing env is incomplete (Stripe keys, price id, or canonical app URL)."
              : code === "authentication_required"
                ? "Sign in to continue to checkout."
                : "Could not start checkout — try manual approval or try again.",
        );
        return;
      }
      if (!data.url) {
        setStripeErr("Checkout did not return a redirect URL.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setStripeErr("Network error starting checkout.");
    } finally {
      setStripeBusy(false);
    }
  }, []);

  const serverStatusPanel = (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Server entitlement (authority)
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Effective plan limits:{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{resolverLabel}</span>
      </p>
      {manualProGranted ? (
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
          Pro access is active via manual approval (recorded server-side).
        </p>
      ) : null}
      {resolvedPlanTier === "pro" && !manualProGranted ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Pro limits apply from workspace defaults — not via a simulated app purchase. Operators use the entitlement CLI when
          manual approval is granted.
        </p>
      ) : null}
      {resolvedPlanTier === "free" ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {offerStripeHostedCheckout ? (
            <>
              Hosted Stripe Checkout may be available below when billing is explicitly enabled server-side — Pro still comes from webhook-backed entitlements after checkout, not from this page’s query string.
            </>
          ) : (
            <>Closed beta uses manual approval by default — self-serve checkout stays off until operators enable billing.</>
          )}
        </p>
      ) : null}

      <p className="mt-2 text-xs font-mono text-zinc-600 dark:text-zinc-300">
        ownerId: <span className="select-all">{ownerId}</span>
      </p>

      {entitlement ? (
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
          <p>
            Stored row · plan <span className="font-medium text-zinc-800 dark:text-zinc-100">{entitlement.planTier}</span>, status{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-100">{entitlement.status}</span>, source{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-100">{entitlement.source}</span>
          </p>
          {entitlementExpired(entitlement.expiresAtIso) ? (
            <p className="mt-1 font-medium text-amber-700 dark:text-amber-300">Stored expiry passed — resolver treats entitlement as inactive.</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">No row in owner_entitlements for this owner — resolver falls back to environment defaults.</p>
      )}
    </section>
  );

  const accessCtas = resolvedPlanTier === "pro"
    ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {manualProGranted ? "Pro — manual approval" : "Pro — workspace defaults"}
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
                Request Pro access (email)
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void handleCopyRequest()}
                className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Copy Pro access request
              </button>
            )}
            {offerStripeHostedCheckout ? (
              <button
                type="button"
                disabled={stripeBusy}
                onClick={() => void handleStripeCheckout()}
                className="inline-flex items-center justify-center rounded-md border border-emerald-700 bg-white px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-600 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
              >
                {stripeBusy ? "Starting checkout…" : "Continue with Stripe Checkout"}
              </button>
            ) : null}
          </div>
          {!mailtoHref ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Set <span className="font-mono">PROMI_UPGRADE_REQUEST_EMAIL</span> so the primary button opens an email draft.
              Otherwise copy includes your owner ID so an operator can run <span className="font-mono">npm run entitlement:grant</span>.
            </p>
          ) : null}
          {copyNotice ? <p className="text-xs text-zinc-600 dark:text-zinc-400">{copyNotice}</p> : null}
          {stripeErr ? <p className="text-xs text-amber-800 dark:text-amber-200">{stripeErr}</p> : null}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Back to dashboard
          </Link>
        </div>
      );

  return (
    <div className="space-y-5">
      {serverStatusPanel}

      {checkoutReturn === "success" ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-50">
          You returned here after Stripe. <strong>That is not proof of Pro.</strong> Access updates when Stripe webhooks
          reconcile entitlements server-side — wait a moment and refresh, or ask an operator to verify webhook delivery.
        </p>
      ) : null}
      {checkoutReturn === "cancelled" ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
          Checkout was cancelled — no Stripe subscription was completed from this attempt.
        </p>
      ) : null}

      {internalBetaMode ? (
        <p className="text-xs text-amber-800 dark:text-amber-100/90">
          Internal beta: public paid SaaS stays NO-GO until checkout + webhook E2E rehearsal is evidenced.
          {offerStripeHostedCheckout ? " Hosted Checkout may appear for Stripe test rehearsals; manual approval remains documented." : " Operators typically grant Pro via database tooling when approved."}
        </p>
      ) : null}

      {productionEnvironment ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {offerStripeHostedCheckout ? (
            <>
              Hosted checkout may redirect to Stripe when billing is intentionally enabled — your tier still comes only from{" "}
              <span className="font-medium">owner_entitlements</span> after webhooks process; do not rely on browser return URLs.
            </>
          ) : (
            <>
              Self-serve hosted checkout stays hidden until billing is explicitly enabled server-side — effective plan follows server entitlements, not billing UI hints.
            </>
          )}
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
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Need Pro limits?</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pro expands limits and analytics depth.
          {offerStripeHostedCheckout
            ? " Use manual approval (email/copy) unless your operators have enabled Stripe test/live checkout for this deployment — Stripe paths still activate Pro only via webhook‑driven entitlement updates."
            : " Closed beta enrollment stays approval-based — submit a request and an operator will attach Pro to your owner ID if approved."}
        </p>
        <div className="mt-4">{accessCtas}</div>
      </section>

      {showDevMockPlayground ? (
        <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-4 text-xs dark:border-amber-800 dark:bg-amber-950/20">
          <p className="font-medium text-amber-900 dark:text-amber-200">Developer-only: local billing preview</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-200/85">
            The following page toggles legacy <span className="font-semibold">localStorage</span> state only — it{" "}
            <span className="font-semibold">does not</span> grant Pro on the server and is not linked in production builds.
          </p>
          <Link
            href="/upgrade/checkout"
            className="mt-2 inline-flex text-xs font-medium text-amber-900 underline underline-offset-2 dark:text-amber-200"
          >
            Open dev mock playground
          </Link>
        </section>
      ) : null}
    </div>
  );
}
# Phase 13.2.9 — Stripe live-mode readiness planning

**Purpose:** Plan the **safest path** from **Stripe test-mode validated billing** (Phases **13.2.5–13.2.8**) to **live-mode readiness** — without rotating keys, exposing live checkout broadly, or changing application billing code in this phase.

**Scope:** Planning and documentation only. **Do not** put **`sk_live_`** secrets in repo files, preview deployments, or shared logs. **Do not** enable public paid self-serve until compliance, rollback, rehearsal evidence, and **human sign-off** are complete.

**Prerequisites satisfied in test mode (summary):**

- **13.2.5** — Checkout → webhook → mirror → **`owner_entitlements` (`provider`)** → **`/upgrade`**: PASS (recorded).
- **13.2.6 Scenario A** — cancellation → mirror terminal → entitlement **`provider` free**: PASS (recorded).
- **13.2.7** — **`npm run billing:health`**, soak/monitoring plan: PASS (ongoing cadence).
- **13.2.8 Scenario B** — manual lock survives provider cancel; critical health counts **0**: PASS (recorded).

**Public paid launch remains NO-GO** until live readiness **and** positioning/compliance/soak/sign-off gates in this doc (and release management) are satisfied.

---

## 1) Live-mode environment prerequisites (audit)

These align with server code: **`src/lib/billing/billing-env.ts`**, **`src/lib/billing/app-url.ts`**, **`app/api/billing/checkout-session/route.ts`**, **`app/api/webhooks/billing/stripe/route.ts`**.

| Variable | Role | Live-mode notes |
|----------|------|-----------------|
| **`PROMI_BILLING_ENABLED`** | Master switch for webhook ingest (persist + mirror + provider entitlement sync) and Checkout API eligibility | Keep **`0`** until an approver authorizes live billing on a **named** deployment. **`1`** only in **Production** (or an explicit restricted staging project), never “by accident” on Preview. |
| **`PROMI_BILLING_PROVIDER`** | Must be **`stripe`** for Stripe path | Same value in test/live; wrong value → ingest/Checkout misaligned. |
| **`STRIPE_SECRET_KEY`** | Stripe API secret (`sk_live_…` for live) | **Production-only** secret. **Never** reuse test keys (`sk_test_…`) in live or live keys in local dev. Rotate per Stripe/account policy; update Vercel **Production** env only. |
| **`STRIPE_WEBHOOK_SECRET`** | Verifies Stripe signature on **`POST /api/webhooks/billing/stripe`** (`whsec_…`) | **One secret per webhook endpoint.** Live Dashboard endpoint → **live** signing secret. **Do not** paste test CLI `whsec_` into Production. |
| **`STRIPE_PRO_PRICE_ID`** | Subscription **`price_…`** for Pro line item | Must be a **live** Price id created in Stripe **live** mode (dashboard toggle). Test prices must not be mixed with **`sk_live_`**. |
| **`PROMI_APP_URL`** | **Preferred** canonical public origin (**HTTPS**, no trailing slash) for Checkout **`success_url` / `cancel_url`** | Must match **actual** Production hostname (e.g. Vercel production domain). Wrong value → redirects to wrong host post-Checkout. |
| **`NEXT_PUBLIC_APP_URL`** / **`NEXTAUTH_URL`** | Fallbacks for canonical origin resolution | If used, ensure they resolve to the same **Production** origin as **`PROMI_APP_URL`** to avoid ambiguity. |

**Operational / platform**

| Topic | Requirement |
|--------|--------------|
| **Vercel (or host) env separation** | **Production**, **Preview**, and **Development** envs must **not** share Stripe live secrets. Prefer **Production-only** overrides for **`sk_live_`**, live **`whsec_`**, and live **`price_`**. |
| **Test vs live key separation** | Maintain a checklist when rotating: confirm Dashboard mode (test vs live), confirm key prefix (`sk_test_` vs `sk_live_`), confirm webhook endpoint URL and secret pair. |
| **`PROMI_BILLING_HEALTH_PENDING_MINUTES`** | Optional; defaults in **`scripts/billing-health.mjs`** (**30** min stale threshold). Tighten for stricter SLA after go-live if agreed. |

**Checkout visibility:** Hosted Checkout is offered server-side only when **`isStripeHostedCheckoutOfferedServer()`** is true (**billing ON** + **`PROMI_BILLING_PROVIDER=stripe`** + **`STRIPE_SECRET_KEY`** + **`STRIPE_PRO_PRICE_ID`** + resolvable canonical app URL). Turning **`PROMI_BILLING_ENABLED=0`** removes the **`/upgrade`** Stripe CTA path without schema changes.

---

## 2) Live-mode safety gates

All should be satisfied **before** **`sk_live_*`** is stored in Production or before **paid** checkout is exposed beyond an approved rehearsal.

| # | Gate |
|---|------|
| 1 | **Test-mode evidence complete** — **13.2.5**, **13.2.6 A**, **13.2.8** recorded PASS (or explicit written waivers documented per **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`**). |
| 2 | **`npm run billing:health`** — **zero** critical counts on target DB immediately before enabling live billing on that DB. |
| 3 | **Stripe Dashboard (live)** — Product and **live** recurring **Price** exist; metadata and descriptions match approved commercial copy. |
| 4 | **Live webhook endpoint** — HTTPS URL **`POST https://<production-host>/api/webhooks/billing/stripe`** registered in Stripe **live** mode; selected event types match what Promi handles (**subscription** lifecycle + **`checkout.session.completed`** as applicable). |
| 5 | **Webhook signing secret** — Live **`whsec_…`** stored only in **Production** env (**`STRIPE_WEBHOOK_SECRET`**). |
| 6 | **Checkout enabled only after approval** — Named approver records **GO** on the **live-mode GO/NO-GO** table (§ below) before **`PROMI_BILLING_ENABLED=1`** with live keys. |
| 7 | **Rollback plan verified** — Operators can articulate §6 rollback steps without ambiguity; **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`** rollback section remains valid. |

---

## 3) Commerce and compliance checklist

Complete with legal/product owner before implying **paid** self-serve to non-test users. This list is **not** legal advice; engage counsel for your jurisdiction(s).

| Item | Status / owner | Notes |
|------|----------------|--------|
| **Pricing copy** | | What Pro costs, billing period, currency, inclusive/exclusive wording. Matches **`/upgrade`** and Stripe Checkout line. |
| **Refund policy** | | Window, process, exclusions; link from site/app if required. |
| **Cancellation policy** | | How customers cancel renewal; aligns with Stripe subscription behavior and post-cancel access. |
| **Customer support contact** | | Email or ticket path for billing issues. |
| **Business / legal trading name** | | Matches Stripe account and customer-facing receipts. |
| **Tax / VAT / Korea considerations** | | Whether Stripe Tax, MOSS/VAT OSS, Korean **VAT**/electronic supply rules, withholding, etc. apply; Stripe account country vs customer country. |
| **Terms of service** | | URL and version surfaced at purchase if required. |
| **Privacy policy** | | URL; payment flows and webhooks omit PII in logs (**already** policy in webhook implementation). |

---

## 4) Operational monitoring (live consideration)

Borrow definitions from **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`**; tighten for Production when billing goes live.

| Area | Recommendation |
|------|----------------|
| **`billing:health` cadence** | At minimum: after deploys touching billing routes, weekly in any billing-enabled Production window, daily during soak after go-live (adjust with approvers). |
| **Pending webhook threshold** | **`PROMI_BILLING_HEALTH_PENDING_MINUTES`** (default **30**) — stale **`processed_at IS NULL`** rows are **critical**; page on sustained non-zero. |
| **Webhook HTTP 4xx / 5xx** | Monitor route **`POST /api/webhooks/billing/stripe`**: spikes in **400** (often signature mismatch) or **500** (processing failures) require immediate investigation — Stripe retries **500**s. |
| **Stripe Dashboard** | Developers → Webhooks → **failed deliveries** for the production endpoint; resolve signing secret / availability issues. |
| **Entitlement mismatch review** | On incident: sample **`billing_subscriptions`** vs **`owner_entitlements`** (**`source=provider`**) plus **`entitlement_audit_logs`**; respect **manual lock** (**Scenario B**) as intentional when documented. |

---

## 5) Live-mode rehearsal plan (controlled)

Perform on a **restricted** Production (or explicitly named staging with **live** keys — avoid if staging shares a DB with test data) **only after** §2 gates and commerce checklist progress are approved.

1. **Account:** Use an **internal** / **private** Stripe customer identity (employee or controlled legal entity email), not early-access users.
2. **Environment:** Enable **`PROMI_BILLING_ENABLED=1`** with **live** keys only on the **approved** hostname and DB — not Preview, not local dev with **`sk_live_`**.
3. **One checkout:** Complete **one** hosted Checkout subscription; confirm **`billing_webhook_events`** row(s), **`billing_customers`** / **`billing_subscriptions`**, **`owner_entitlements`** (**`provider`**), **`/upgrade`** reflects **Stripe subscription**.
4. **Webhook:** Confirm Dashboard shows **successful** delivery; handler returns **200**; **`processed_at`** set on ingested rows.
5. **Cancel / refund:** Per policy, cancel subscription in Stripe and/or refund; confirm downgrade path matches **13.2.6** mapping for **`source=provider`**; **`billing:health`** remains clean.
6. **Evidence:** Record in a dated addendum (this file’s § “Recorded live rehearsal” or a new evidence doc if the project splits **13.2.10** execution) — commit SHA, operator, Stripe ids **redacted** in public repo if policy requires.

**Until rehearsal PASS + sign-off:** keep **`PROMI_BILLING_ENABLED=0`** on Production or omit live keys.

### Recorded live rehearsal _(append when executed)_

| Field | Value |
|--------|--------|
| Date/time | |
| Environment | |
| Approver | |
| Result | `PENDING` / `PASS` / `FAIL` |

---

## 6) Rollback (live billing stress or policy withdrawal)

Same core steps as **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`** § rollback; emphasized for live context.

1. Set **`PROMI_BILLING_ENABLED=0`** (or unset) — webhooks no longer persist or mutate billing tables; handler returns **`200`** `persisted: false`.
2. **Hide Checkout CTA** — verify **`/upgrade`** no longer offers **Continue with Stripe Checkout** (server gating).
3. **Keep manual approval** — **`PROMI_UPGRADE_REQUEST_EMAIL`**, **`entitlement:grant` / `entitlement:revoke`** remain for operator correction.
4. **Correct entitlements** with CLI **`npm run entitlement:manage -- …`** (or **`entitlement:grant` / `entitlement:revoke`** wrappers) — document operator and notes.
5. **Preserve** **`billing_webhook_events`** (and **`billing_*`**) — **do not delete** webhook rows as part of rollback; use for RCA and Stripe replay decisions.
6. **Stripe Dashboard:** cancel subscriptions, pause offending products, or issue refunds — Promi-side disable does **not** replace Stripe billing cleanup.
7. **Evidence retention** — retained PASS/FAIL docs and dashboards exports support post-incident review; do not purge.

---

## GO / NO-GO — Stripe live-mode enablement _(Production, paid path)_

This table authorizes **`sk_live_*`** + live **`whsec_`** + live **`price_`** on **named Production** **and** toggling **`PROMI_BILLING_ENABLED=1`** for rehearsed billing. **It does not** by itself authorize broad **public SaaS** launch — see **`docs/INTERNAL_BETA_CHECKLIST.md`** positioning.

**GO — all required (unless waived in writing by approvers):**

| # | Requirement |
|---|-------------|
| 1 | Phase **13.2.9** checklist reviewed; env separation and webhook secret pairing documented for Production. |
| 2 | Test-mode evidence **13.2.5 / 13.2.6 A / 13.2.8** complete (**or** documented waivers). |
| 3 | **`npm run billing:health`** PASS (zero critical) on Production DB snapshot before toggle. |
| 4 | Live **Product / Price** configured in Stripe **live** mode; Pricing copy approved. |
| 5 | Live webhook endpoint configured; **`STRIPE_WEBHOOK_SECRET`** matches endpoint; trial event delivery succeeds. |
| 6 | Commerce/compliance checklist (§3) completed or explicitly deferred with written risk acceptance. |
| 7 | Rollback (§6) understood by on-call/operators. |
| 8 | **Controlled live rehearsal** (§5) **PASS** recorded **or** explicit approver waiver for skipping rehearsal with documented compensating controls. |
| 9 | Named **approver** (name, role, date) on file for enabling live billing. |

**NO-GO:**

| Condition |
|-----------|
| Live secrets present on Preview/Development or leaked in CI logs/support tickets. |
| **`billing:health`** shows sustained **critical** drift without RCA. |
| Webhook backlog (**`processed_at` null**) beyond agreed SLA during test-mode soak. |
| Checkout or marketing implies **paid** availability before compliance/sign-off. |
| **`PROMI_APP_URL`** (or canonical fallback) does not match Production Checkout return host. |

**Public paid SaaS:** remains **NO-GO** until release management adds multi-tenant auth, isolation posture, and any remaining product gates — **`docs/INTERNAL_BETA_CHECKLIST.md`** § “Must not ship as public SaaS yet.”

---

## Related docs

- **`docs/PHASE13_2_BILLING_PLAN.md`** — phased rollout pointer to **13.2.9**.
- **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`** — soak, **`billing:health`**, test-mode consideration GO/NO-GO.
- **`docs/INTERNAL_BETA_RUNBOOK.md`** / **`docs/INTERNAL_BETA_CHECKLIST.md`** — deploy profiles and rehearsal gates.
- **`docs/DEVELOPMENT.md`** — env variable reference (test vs live values set in env, never in repo).

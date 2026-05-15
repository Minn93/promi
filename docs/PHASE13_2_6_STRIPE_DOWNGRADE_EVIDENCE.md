# Phase 13.2.6 — Stripe subscription cancellation / downgrade rehearsal (evidence)

**Purpose:** Record verification that **Stripe test-mode** cancellation or terminal subscription states flow through **verified webhooks** → **`billing_subscriptions` mirror** → **`owner_entitlements` (`source=provider`)** downgrade (or **manual lock skip**) → **`/upgrade` labels** match DB reality.

**Policies (unchanged):**

- Resolver uses **`getPlanTierForOwner`** (see `src/lib/plans/server.ts`), which consults **`owner_entitlements`** via **`readOwnerEntitlementPlanTier`** (`src/lib/entitlements/server.ts`). Stripe mirror → entitlement mapping is in **`src/lib/billing/entitlement-sync.ts`** — this phase **documents behavior**; do not change precedence without a verified mapping defect.
- **Public paid SaaS remains NO-GO** until stakeholders sign off; this doc does **not** authorize live mode.

**Expected mapping reminder** (Stripe `subscription.status` on mirror → entitlement): canceled / cancelled → **`plan_tier=free`**, **`status=canceled`**; `unpaid`, `incomplete*`, `paused` → **`free`** / **`inactive`**; see table in **`docs/PHASE13_2_BILLING_PLAN.md`**.

---

## Rehearsal status (latest recorded run)

| Field | Value |
|--------|--------|
| Last updated | **2026-05-05** (rehearsal completed; precise UTC/time in operator log) |
| Scenario A outcome (provider downgrade) | **PASS** |
| Scenario B (manual lock) | **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`** (**Phase 13.2.8**) — **PENDING** until operator documents **PASS** |
| Stripe mode | **test** |
| Sign-off (name / role) | _(optional formal sign-off line)_ |

**Stripe downgrade path (test mode) — decision:** **PASS** for **Scenario A** (provider cancellation → mirror → entitlement → **`/upgrade`**). Manual lock **Scenario B** is recorded in **Phase 13.2.8**.

---

## Recorded evidence — Scenario A (PASS)

### Global

| Field | Value |
|--------|--------|
| Date/time (UTC) | **2026-05-05** _(exact timestamp retained in operator notes)_ |
| Environment | **Local** — **Stripe test mode**, app + DB on developer machine; Stripe CLI (or equivalent) forwarding to `POST /api/webhooks/billing/stripe` |
| Commit SHA | As at rehearsal (`git rev-parse HEAD` in that workspace) |
| Operator | _(local operator)_ |
| **ownerId** | Same **`getCurrentOwnerId()`** as Phase **13.2.5** hosted Checkout success (internal-beta owner env or real-auth session — **concrete id not pasted in repo**) |
| **Stripe subscription id** (`sub_…`) | Same **test** subscription created in Phase **13.2.5** Checkout flow (**`sub_*` retained in operator / Stripe Dashboard test data only**) |

### Preconditions

| Check | pass / fail |
|--------|-------------|
| `npm run validate:owner-ids` | pass |
| `npm run preflight:internal-beta` | pass |
| `npm run build` | pass |
| `PROMI_BILLING_ENABLED=1`, `PROMI_BILLING_PROVIDER=stripe` | pass |
| Webhook forwarding or Dashboard endpoint + matching `STRIPE_WEBHOOK_SECRET` | pass |
| Prior **13.2.5** active test subscription exists for this owner (or create one first) | pass |

### Baseline (before Scenario A)

| Table / UI | Snapshot |
|-------------|----------|
| `billing_subscriptions.status` | **active** (or equivalent billable Stripe state leading into cancel) |
| `owner_entitlements` (plan / status / source) | **pro** / **active** (or **trialing** / **past_due**) / **provider** |
| `/upgrade` pill text | **Pro — Stripe subscription** |

### Assertions confirmed (after cancellation webhooks)

| Assertion | Result |
|-----------|--------|
| **Event type(s) received** | **`customer.subscription.updated`** and/or **`customer.subscription.deleted`** (Stripe cancel flow) |
| **Webhook HTTP response** | **200** from `POST /api/webhooks/billing/stripe` |
| **`billing_webhook_events`** | Rows ingested with **`processed_at`** set |
| **`billing_subscriptions`** | **Downgraded / canceled** status consistent with Stripe terminal state |
| **`owner_entitlements`** | **`free`** with **`source=provider`** after sync (mapping per **`PHASE13_2_BILLING_PLAN.md`**) |
| **`entitlement_audit_logs`** | **`provider_sync`** entry for downgrade with **`notes`** like `customer.subscription.*:evt_…` |
| **`/upgrade` UI** | **Does not** show **Pro — Stripe subscription** after refresh |

---

## Evidence template — future runs

For an additional downgrade rehearsal, duplicate the structure of **Recorded evidence — Scenario A** above into a new subsection with fresh tables (or append a dated section below).

---

## Scenario A — Procedure (reference for future runs)

**Goal:** Stripe ends (or degrades) the subscription; Promi mirrors and entitlement follow.

**Recorded outcome:** This rehearsal’s PASS results are documented in **Recorded evidence — Scenario A (PASS)** at the top of this file.

### Steps

1. In **Stripe Dashboard (test)** for the subscription, **cancel immediately** at period end vs now — either path is acceptable if webhooks ultimately deliver **`customer.subscription.updated`** and/or **`customer.subscription.deleted`** with terminal status. Note what Stripe emits.
2. Watch **Stripe CLI** or Dashboard Events: deliveries to **`POST /api/webhooks/billing/stripe`** return **HTTP 200**.
3. Inspect **`billing_webhook_events`** (new rows, **`processed_at` set**, `event.type` logged).
4. Confirm **`billing_subscriptions`** row for `provider_subscription_id` reflects updated **`status`** (e.g. `canceled`).
5. Confirm **`owner_entitlements`**: **`plan_tier=free`**, **`status`** per mapping (**`canceled`** vs **`inactive`** per **`docs/PHASE13_2_BILLING_PLAN.md`**), **`source=provider`** after sync (unless Scenario B overlaps).
6. Confirm **`entitlement_audit_logs`** new row **`action=provider_sync`**, **`notes`** like **`customer.subscription.deleted:evt_…`** (no raw payloads in notes).
7. Hard refresh **`/upgrade`**: expect **Free** tier CTAs — **no** **Pro — Stripe subscription** pill (may show **Pro — workspace defaults** only if resolver still resolves Pro from env without a contradictory row — should not occur if entitlement row is authoritative free).

### Scenario A checklist

| Item | Pass / fail | Notes |
|------|-------------|--------|
| Webhook **`200`** | **PASS** | Stripe delivered **`customer.subscription.updated`** and/or **`customer.subscription.deleted`** (cancel path); Promi responded **HTTP 200** |
| **`billing_webhook_events`** | **PASS** | Ingest rows present; **`processed_at`** populated (not stuck pending) |
| **`billing_subscriptions`** after | **PASS** | Mirror **`status`** shows terminal/canceled Stripe state (e.g. **`canceled`**) |
| **`owner_entitlements`** after | **PASS** | Downgrade to **`free`** with **`source=provider`** and entitlement **`status`** per mapping (e.g. **`canceled`** for canceled subscription) |
| **`provider_sync`** audit for downgrade | **PASS** | New **`entitlement_audit_logs`** row(s) with **`action=provider_sync`**, **`notes`** of form `event.type:evt_…` |
| **`/upgrade` label after refresh** | **PASS** | **No longer** shows **Pro — Stripe subscription**; Free / request-Pro path consistent with resolver after **`owner_entitlements`** downgrade |

---

## Scenario B — Manual override protection (Phase 13.2.8)

**Full procedure + evidence template:** **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`**.

_Use **13.2.6** for Scenario **A** (provider-only cancel) only; Scenario **B** is no longer maintained as a duplicate checklist in this file._

---

## GO / NO-GO — Stripe **downgrade path** (test mode)

| Decision | Selector | Date |
|----------|----------|------|
| **GO** — Scenario A (provider cancel → downgrade) satisfied | Local operator | **2026-05-05** |
| **PENDING / WAIVED** — Scenario **B** (**Phase 13.2.8**) — manual lock rehearsal | **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`** / approver waiver | See **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`** GO table |
| **NO-GO** — Scenario A failed | — | _(not chosen for recorded run)_ |

### Known issues / follow-ups

- Record **PASS** or waiver for **Scenario B** in **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`** before live Stripe keys (unless waived in writing).

---

## Troubleshooting

| Symptom | Checks |
|---------|--------|
| Webhook **500** / `processed_at` null | App logs; fix config and let Stripe retry |
| Mirror updates, entitlement stuck Pro | **Manual lock**? Inspect `owner_entitlements.source` / `status` |
| **`subscription_no_owner_resolution`** | Metadata / `billing_customers` link — see **`docs/PHASE13_2_BILLING_PLAN.md`** |
| UI still shows Stripe Pro | Hard refresh; confirm row is not still `pro`+`provider`+active status |

---

## Related docs

- **`docs/PHASE13_2_5_STRIPE_E2E_EVIDENCE.md`** — subscribe path  
- **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`** — Scenario **B** manual lock rehearsal  
- **`docs/PHASE13_2_BILLING_PLAN.md`** — mapping + manual policy  
- **`docs/DEVELOPMENT.md`** — env and webhook notes  
- **`docs/INTERNAL_BETA_RUNBOOK.md`**

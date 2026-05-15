# Phase 13.2 — Billing provider wiring (Stripe first)

Planning reference for moving Promi from **manual `owner_entitlements`** toward **provider-backed billing** while keeping **`OwnerEntitlement` the app authorization source**.

## Principles

- **`owner_entitlements` + resolver** (`getPlanTierForOwner` → `readOwnerEntitlementPlanTier`) remain the **only** tier inputs for authorization.
- **Stripe mirrors** live in **`billing_customers`** / **`billing_subscriptions`**; webhooks reconcile into entitlement rows in **Phase 13.2.3+**.
- **`billing_webhook_events`** stores **signature-verified** deliveries with **DB idempotency** (`provider`, `provider_event_id` unique) and **`processed_at`** once mirror work for that event finishes.
- **Manual grant/revoke CLI** stays an operator override (interaction with provider state defined in entitlement sync phases).
- **No client / localStorage billing authority** — dev mock UI remains non-production.
- Public paid SaaS remains **NO-GO** until **13.2.5**, **13.2.6**, **13.2.8** manual-override evidence (**`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`**) **or** explicit approver **waiver** (see **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`**), plus **13.2.7** soak/monitoring prerequisites, **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`** (**13.2.9**) gates (env separation, rehearsal, rollback, commerce/compliance, **human sign-off**), **and** stakeholder approval **before Stripe live keys**; default deployment keeps billing **OFF**.

## Phased rollout

| Phase | Scope |
|-------|--------|
| **13.2.1** | `POST /api/webhooks/billing/stripe`: verify Stripe signature (`raw body`), ingest row when enabled. |
| **13.2.2** | Same transaction: mirror **`billing_customers` / `billing_subscriptions`** from **`customer.subscription.*`**. **`checkout.session.completed`** remained mirror-deferred until **13.2.4** server-bound owner metadata existed. |
| **13.2.3** | After mirror upserts, **provider sync** into **`owner_entitlements`** with **manual lock** + **`entitlement_audit_logs.action=provider_sync`** (notes: `eventType:eventId` only). Resolver adds **`past_due`** as billable-active (Pro grace). |
| **13.2.4** | **`POST /api/billing/checkout-session`**: authenticated owner only (**`getCurrentOwnerId`**); **never** trusts body `ownerId`; creates/reuses Stripe Customer + **`billing_customers`**; hosted Checkout (**`mode=subscription`**) with **`metadata.owner_id`**, **`subscription_data.metadata.owner_id`**, **`client_reference_id=owner_id`** set **server-side**; returns **`{ url }`** only. **`checkout.session.completed`** webhooks produce the same mirror + entitlement pipeline as **`customer.subscription.*`** when bindings validate (Stripe signature + mismatch guards). **`/upgrade?checkout=success|cancelled`** is **UX only** — **not entitlement proof.** |
| **13.2.5** | **Stripe test-mode subscribe E2E** — Checkout → webhook → Billing* mirror → **`owner_entitlements` (`provider`)** → **`/upgrade`** after refresh. Record evidence in **`docs/PHASE13_2_5_STRIPE_E2E_EVIDENCE.md`**. Does **not** declare public launch. |
| **13.2.6** | **Scenario A** — Stripe **test** cancellation → **`billing_subscriptions`** + **`owner_entitlements` (`provider`)** downgrade. Evidence: **`docs/PHASE13_2_6_STRIPE_DOWNGRADE_EVIDENCE.md`**. (Scenario **B** manual lock moved to **13.2.8**.) |
| **13.2.7** | **Billing soak / monitoring plan** — DB consistency (`npm run billing:health`), observability checklist, rollback, **live-mode consideration GO/NO-GO**. **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`**. **Does not** enable Stripe live or public launch. |
| **13.2.8** | **Manual override protection (Scenario B)** — grant **`manual`** Pro → Stripe cancel webhook → mirror updates, **`owner_entitlements`** unchanged, **`/upgrade` manual pill** persists → revoke → reconcile. **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`**. |
| **13.2.9** | **Stripe live-mode readiness planning** — env prerequisites, safety gates, commerce/compliance checklist, monitoring, controlled live rehearsal outline, rollback, **live-mode GO/NO-GO**. **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`**. **Does not** rotate keys by itself. |
| **13.2.10+** | Controlled **Stripe live-key** rehearsal execution, commerce rollout, eventual public SaaS (**still** gated separately). |

### Phase 13.2.5 — evidence checklist (high level)

1. Preconditions: Stripe **test** keys, billing flags **`PROMI_BILLING_ENABLED=1`**, **`PROMI_BILLING_PROVIDER=stripe`**, canonical **`PROMI_APP_URL`** (or fallbacks).
2. `stripe listen` (or reachable HTTPS webhook endpoint) forwards to **`/api/webhooks/billing/stripe`** with matching **`STRIPE_WEBHOOK_SECRET`**.
3. Signed-in owner → **`/upgrade`** → **Continue with Stripe Checkout** → complete test subscription.
4. After webhooks settle, refresh **`/upgrade`**: **Pro** from **`owner_entitlements.source=provider`**.
5. DB: **`billing_webhook_events`** with **`processed_at`**, **`billing_customers`**, **`billing_subscriptions`**, **`provider_sync`** audits.
6. Scenario **A** downgrade (provider path, no manual lock): **`docs/PHASE13_2_6_STRIPE_DOWNGRADE_EVIDENCE.md`**.
7. Scenario **B** (manual lock): **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`**.

**Full subscribe procedure:** **`docs/PHASE13_2_5_STRIPE_E2E_EVIDENCE.md`**.

### Phase 13.2.6 — downgrade checklist — Scenario A only (high level)

1. Start from an **active** test subscription (from **13.2.5**).
2. Cancel or reach terminal status in Stripe; confirm **`customer.subscription.updated`** / **`deleted`** → **200**.
3. **`billing_subscriptions.status`** reflects terminal state (e.g. `canceled`).
4. **`owner_entitlements`** → **`free`** + **`canceled`/`inactive`** per mapping (**`provider` source)**; **`provider_sync`** audit entry.
5. **`/upgrade`**: no **Pro — Stripe subscription** after refresh.

**Procedure / recorded PASS:** **`docs/PHASE13_2_6_STRIPE_DOWNGRADE_EVIDENCE.md`**.

### Phase 13.2.8 — manual override rehearsal (Scenario B)

1. Active **Stripe test** subscription + ingest **ON**.
2. **`npm run entitlement:grant -- … --notes=phase13_2_8_manual_lock`**.
3. **`/upgrade`** shows **Pro — manual approval**.
4. Cancel subscription in Stripe; webhook **200**; **`billing_subscriptions`** reflects terminal state.
5. **`owner_entitlements`** stays **manual** Pro; **`billing:health`** stays **PASS** (critical drift checks intentionally ignore **`source=manual`** mismatches vs mirror).
6. **`npm run entitlement:revoke -- … --notes=phase13_2_8_manual_unlock`** + optional Checkout restore → provider Pro again.

**Evidence:** **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`**.

### Phase 13.2.7 — soak / monitoring (high level)

1. Run **`npm run billing:health`** on schedule (see soak doc); fix any **CRITICAL** counts before live-key consideration.
2. Monitor webhook **HTTP** outcomes and Stripe Dashboard delivery **outside** the script.
3. Document rollback (**`PROMI_BILLING_ENABLED=0`**, preserve **`billing_*`**, manual CLI).
4. Approver sign-off on **GO/NO-GO** table in **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`**; include **Phase 13.2.8** PASS when evaluating provider + manual interplay.
5. Before **`sk_live_*`** on Production or broad paid checkout: **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`** (**13.2.9**) gates and recorded controlled rehearsal (**or** written waiver).

**Full plan:** **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`**.

**Live-mode planning:** **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`**.

## Environment (Stripe)

See **`docs/DEVELOPMENT.md`** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, canonical app URL (**`PROMI_APP_URL`** preferred; fallbacks documented), `PROMI_BILLING_PROVIDER=stripe`, `PROMI_BILLING_ENABLED` (default OFF). Optional **`NEXT_PUBLIC_PROMI_BILLING_ENABLED`** is **display-only** if ever adopted — **routes and enforcement never trust client env.**

## Webhook idempotency

- **`processed_at`** gates the **entire** mirror + entitlement slice: replays return **`200`** `alreadyProcessed` / `alreadyProcessedConcurrent` with **no duplicate audit rows**.
- **Concurrent first delivery:** loser may observe `processed_at` already set inside the transaction and exit without mutating.
- **Failed processing before commit:** **`processed_at` stays `null`**, response **`500`** for Stripe retry; mirror upserts + entitlement writes are **repeatable** without double-auditing once `processed_at` is set.

## Manual override policy (13.2.3)

While **`owner_entitlements.source=manual`** **and** **`status` ∈ {`active`,`manual`}`** **and** `expires_at` is not past:

- Webhook still updates **Billing*** mirrors.
- Webhook **does not** change **`owner_entitlements`** (JSON `entitlementSkippedManual:true`, log `reason=manual_override`).

**Manual revoke** (`plan_tier=free`, `status=inactive`, `source=manual`) is **not locked** — subsequent **active** Stripe webhooks may set **`source=provider`** Pro again.

## Provider status → entitlement (`source=provider`)

| Stripe `subscription.status` (mirror) | `plan_tier` | `status` | `expires_at` hint |
|--------------------------------------|-------------|----------|-------------------|
| `active` | `pro` | `active` | `period_end` |
| `trialing` | `pro` | `trialing` | `trial_end ?? period_end` |
| `past_due` | `pro` | `past_due` | `period_end` (resolver treats `past_due` as **active** for tier) |
| `canceled`/`cancelled` | `free` | `canceled` | `null` |
| `unpaid`, `incomplete*`, `paused`, unknown | `free` | `inactive` (or `canceled` when Stripe says canceled) | `null` |

## Owner resolution (13.2.2 mirrors)

For **`customer.subscription.*`**: Promi **`owner_id`** from, in order:

1. `subscription.metadata.owner_id`
2. **`billing_customers`** row with `provider_customer_id` = Stripe customer id
3. **`customers.retrieve(id).metadata.owner_id`**

Without a resolved owner, the event is still **marked processed** but **no `BillingSubscription` row** is written (`note: subscription_no_owner_resolution`). **Stripe CLI fixtures** often lack metadata — seed a **`billing_customers`** row or set test metadata in the Dashboard for end-to-end mirror proof.

## Code layout

- `docs/PHASE13_2_5_STRIPE_E2E_EVIDENCE.md` — **13.2.5** operator-run Checkout → webhook subscribe rehearsal + evidence template (GO/NO-GO).
- `docs/PHASE13_2_6_STRIPE_DOWNGRADE_EVIDENCE.md` — **13.2.6** Scenario **A** provider cancel/downgrade.
- `docs/PHASE13_2_7_BILLING_SOAK_PLAN.md` — **13.2.7** soak, monitoring, rollback, live-mode **consideration** GO/NO-GO.
- `docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md` — **13.2.8** manual lock + Stripe cancel rehearsal (Scenario **B**).
- `docs/PHASE13_2_9_LIVE_MODE_READINESS.md` — **13.2.9** Stripe live-mode readiness planning, rehearsal outline, rollback, **live GO/NO-GO**.
- `scripts/billing-health.mjs` — read-only counts; **`npm run billing:health`**.
- `app/api/billing/checkout-session/route.ts` — hosted Checkout Session creation (billing flags **on**); no entitlement writes.
- `src/lib/billing/app-url.ts` — canonical origin for Stripe **`success_url` / `cancel_url`**.
- `src/lib/billing/billing-env.ts` — ingest + Stripe provider + **`isStripeHostedCheckoutOfferedServer()`** (gates Upgrade UI hints).
- `src/lib/billing/stripe-mapping.ts` — Stripe → mirror field helpers.
- `src/lib/billing/stripe-event-handlers.ts` — mirror plan + Prisma upserts (transactional from route).
- `src/lib/billing/entitlement-sync.ts` — provider entitlement upsert + manual lock + audits.

# Phase 13.2 — Billing provider wiring (Stripe first)

Planning reference for moving Promi from **manual `owner_entitlements`** toward **provider-backed billing** while keeping **`OwnerEntitlement` the app authorization source**.

## Principles

- **`owner_entitlements` + resolver** (`getPlanTierForOwner` → `readOwnerEntitlementPlanTier`) remain the **only** tier inputs for authorization.
- **Stripe mirrors** live in **`billing_customers`** / **`billing_subscriptions`**; webhooks reconcile into entitlement rows in **Phase 13.2.3+**.
- **`billing_webhook_events`** stores **signature-verified** deliveries with **DB idempotency** (`provider`, `provider_event_id` unique) and **`processed_at`** once mirror work for that event finishes.
- **Manual grant/revoke CLI** stays an operator override (interaction with provider state defined in entitlement sync phases).
- **No client / localStorage billing authority** — dev mock UI remains non-production.
- Public paid SaaS remains **NO-GO** until checkout, entitlement sync from mirrors, webhook soak, and soak tests ship.

## Phased rollout

| Phase | Scope |
|-------|--------|
| **13.2.1** | `POST /api/webhooks/billing/stripe`: verify Stripe signature (`raw body`), ingest row when enabled. |
| **13.2.2** | Same transaction: mirror **`billing_customers` / `billing_subscriptions`** from **`customer.subscription.*`**. **`checkout.session.completed`** remained mirror-deferred until **13.2.4** server-bound owner metadata existed. |
| **13.2.3** | After mirror upserts, **provider sync** into **`owner_entitlements`** with **manual lock** + **`entitlement_audit_logs.action=provider_sync`** (notes: `eventType:eventId` only). Resolver adds **`past_due`** as billable-active (Pro grace). |
| **13.2.4** (current checkout slice) | **`POST /api/billing/checkout-session`**: authenticated owner only (**`getCurrentOwnerId`**); **never** trusts body `ownerId`; creates/reuses Stripe Customer + **`billing_customers`**; hosted Checkout (**`mode=subscription`**) with **`metadata.owner_id`**, **`subscription_data.metadata.owner_id`**, **`client_reference_id=owner_id`** set **server-side**; returns **`{ url }`** only. **`checkout.session.completed`** webhooks produce the same mirror + entitlement pipeline as **`customer.subscription.*`** when bindings validate (Stripe signature + mismatch guards). **`/upgrade?checkout=success|cancelled`** is **UX only** — **not entitlement proof.** |
| **13.2.5+** | Checkout + webhook **E2E rehearsal**, soak, public paid launch gates. |

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

- `app/api/billing/checkout-session/route.ts` — hosted Checkout Session creation (billing flags **on**); no entitlement writes.
- `src/lib/billing/app-url.ts` — canonical origin for Stripe **`success_url` / `cancel_url`**.
- `src/lib/billing/billing-env.ts` — ingest + Stripe provider + **`isStripeHostedCheckoutOfferedServer()`** (gates Upgrade UI hints).
- `src/lib/billing/stripe-mapping.ts` — Stripe → mirror field helpers.
- `src/lib/billing/stripe-event-handlers.ts` — mirror plan + Prisma upserts (transactional from route).
- `src/lib/billing/entitlement-sync.ts` — provider entitlement upsert + manual lock + audits.

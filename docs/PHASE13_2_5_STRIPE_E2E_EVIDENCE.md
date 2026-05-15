# Phase 13.2.5 — Stripe Checkout → webhook E2E rehearsal (evidence)

**Purpose:** Record a single end-to-end run proving **hosted Checkout (test mode)** → **verified webhooks** → **`billing_*` mirrors** → **`owner_entitlements` (`source=provider`)** → **`/upgrade` reflects Pro after refresh**.

**Policies (unchanged):**

- **`/upgrade?checkout=success` is never entitlement proof.** Pro appears only after webhook-driven DB state.
- **Public paid SaaS remains NO-GO** until this rehearsal is **completed, recorded below, and explicitly signed off** (separate soak / launch steps may still follow).
- **Manual grant/revoke** behavior is unchanged; for the default subscribe path avoid an **active manual lock** (`source=manual`, `status∈{active,manual}`, unexpired).

---

## Rehearsal status (latest recorded run)

| Field | Value |
|--------|--------|
| Last updated | _(fill when recording)_ |
| Outcome | `PENDING` / `PASS` / `PARTIAL` / `FAIL` |
| Stripe mode | _(must be **test**)_ |
| Sign-off (name / role) | |

**Agent/automation note (2026-05-04):** Repository **lint / build / preflight / validate:owner-ids** were run successfully in this workspace. **Live Stripe Checkout + webhook delivery was not executed** here (no Stripe CLI in shell; no operator session). Operators must complete the steps below and replace `PENDING` with evidence.

---

## Evidence template — fill after your run

| Field | Value |
|--------|--------|
| Date/time (UTC) | |
| Environment | e.g. `local-dev` / `staging` |
| Commit SHA | `git rev-parse HEAD` |
| Operator | |
| Stripe Dashboard mode | Test (required) |
| **Test ownerId** (`getCurrentOwnerId` in browser) | |
| Active manual entitlement lock during subscribe test? | `no` (recommended for main path) |
| Preconditions: `npm run validate:owner-ids` | pass / fail |
| Preconditions: `npm run preflight:internal-beta` | pass / fail |
| Preconditions: `npm run build` | pass / fail |

### Outcome checklist

| Step | Pass / fail | Notes |
|------|-------------|--------|
| 1 Preflight scripts | | |
| 2 Stripe CLI forwards to `/api/webhooks/billing/stripe`; `STRIPE_WEBHOOK_SECRET` matches listener `whsec_…` | | |
| 3 App boot with billing flags + canonical URL | | |
| 4 Signed-in test owner session | | |
| 5 `/upgrade`: Stripe CTA visible only when billing enabled + config; manual path still visible | | |
| 6 `POST /api/billing/checkout-session` → redirect to Stripe Hosted Checkout → test card completes | | |
| 7 Return `/upgrade?checkout=success`: UI warns **not** proof of Pro; after webhooks **refresh**: **Pro/provider** effective | | |
| 8a `billing_webhook_events`: row(s) for `stripe`, `processed_at` set | | |
| 8b `billing_customers`: row for owner + Stripe customer id | | |
| 8c `billing_subscriptions`: row for subscription id + owner | | |
| 8d `owner_entitlements`: **pro** + status per mapping (`active` / `trialing` / etc.) **`source=provider`** | | |
| 8e `entitlement_audit_logs`: **`provider_sync`** (notes like `checkout.session.completed:evt_…` or `customer.subscription.updated:evt_…`) | | |
| 9 Cancellation / downgrade webhook (Stripe Dashboard or API): mirror + entitlement follow mapping | | _(optional but recommended)_ |
| 10 Manual override edge (grant manual Pro → cancel in Stripe → no downgrade lock; revoke → restore) | | _(optional)_ |

### IDs to paste (never paste secrets)

| Item | Value |
|------|--------|
| Stripe Checkout Session id (`cs_…`) | |
| Stripe Customer id (`cus_…`) | |
| Stripe Subscription id (`sub_…`) | |
| Example `billing_webhook_events.provider_event_id` (`evt_…`) | |

### Known issues / follow-ups

- 

### GO / NO-GO — Stripe **test-mode** billing path only

| Decision | Selector | Date |
|----------|----------|------|
| **GO** — test-mode rehearsal satisfied | | |
| **NO-GO** — block until issues resolved | | |

---

## Preconditions (environment)

Minimum variables (server / `.env.local`):

| Variable | Notes |
|----------|--------|
| `STRIPE_SECRET_KEY` | **Test** secret (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | From **`stripe listen`** output (`whsec_…`) for local forward |
| `STRIPE_PRO_PRICE_ID` | Test **Price** (`price_…`) for Pro subscription |
| `PROMI_BILLING_ENABLED` | `1` or `true` |
| `PROMI_BILLING_PROVIDER` | `stripe` |
| `PROMI_APP_URL` | Canonical origin (**no trailing slash**), or fallbacks per `src/lib/billing/app-url.ts` |

**Stripe CLI (local forwarding):**

```bash
stripe listen --forward-to localhost:3000/api/webhooks/billing/stripe
```

Copy the **signing secret** into `STRIPE_WEBHOOK_SECRET` for this run. Restart `npm run dev` after changing webhook secret if needed.

Windows: install Stripe CLI separately if `stripe` is not on PATH (see [Stripe CLI install](https://docs.stripe.com/stripe-cli)).

**Owner alignment:** For internal-beta single-owner dev auth, **`PROMI_INTERNAL_BETA_OWNER_ID`** must match the owner you intend to bill, **or** use real-auth with that owner signed in — same guidance as **`docs/PHASE13_1_F_ENTITLEMENT_SMOKE_EVIDENCE.md`**.

**Recommended:** Confirm **no** active manual lock before the subscribe run:

```bash
npm run entitlement:manage -- --action=status --ownerId=<ownerId>
```

---

## Rehearsal procedure

### 1) Repository gates

```bash
npm run validate:owner-ids
npm run preflight:internal-beta
npm run build
```

(Optionally split: `npm run lint` — should be clean aside from known unrelated warnings.)

### 2–3) Listener + app

Terminal A: `stripe listen --forward-to …` (capture `whsec_…`).

Terminal B: `npm run dev` (or deployed URL with webhook endpoint reachable publicly and Dashboard webhook signing secret configured instead of CLI).

### 4–6) Browser

1. Sign in as **test owner** (aligned with **`getCurrentOwnerId()`**).
2. Open **`/upgrade`** — confirm **Continue with Stripe Checkout** appears **only when** billing is fully configured (`isStripeHostedCheckoutOfferedServer()`); manual email/copy CTAs remain.
3. Complete Checkout with a [Stripe test card](https://docs.stripe.com/testing) (e.g. `4242 4242 4242 4242`).
4. After redirect to **`/upgrade?checkout=success`**, confirm **banner** explains return URL is **not** proof — effective plan unchanged until webhook.

### 7) Confirm entitlement after webhooks

- Watch Stripe CLI or Dashboard **Events** until `checkout.session.completed` / `customer.subscription.*` deliveries succeed (HTTP **200** from Promi).
- **Hard refresh** `/upgrade`: server entitlement panel should show **Pro** resolved from **`owner_entitlements`** (**`provider` source**).

### 8) DB / evidence inspection

Tools: **Prisma Studio** (`npx prisma studio`), SQL console, or read-only CLI.

Suggested checks:

- **`billing_webhook_events`**: `provider = stripe`, rows for checkout + subscription types, **`processed_at` not null**.
- **`billing_customers`**: **`owner_id`** = test owner; **`provider_customer_id`** matches Stripe customer.
- **`billing_subscriptions`**: **`owner_id`** + **`provider_subscription_id`** populated; **`status`** matches Stripe subscription.
- **`owner_entitlements`**: **`plan_tier`**, **`status`**, **`source=provider`** per **`docs/PHASE13_2_BILLING_PLAN.md`** mapping.
- **`entitlement_audit_logs`**: **`action=provider_sync`**; **`notes`** = `event.type:event.id` style (no raw payloads).

Entitlement CLI (read-after-write):

```bash
npm run entitlement:manage -- --action=status --ownerId=<ownerId>
npm run entitlement:audit -- --ownerId=<ownerId>
```

### 9) Downgrade path (recommended)

Cancel or delete the subscription in **Stripe Dashboard (test)**. Expect webhook → mirror update → entitlement maps to **`free`** / **`canceled`** / **`inactive`** per policy (unless blocked by manual lock).

### 10) Manual override path (optional)

1. **`npm run entitlement:grant`** for test owner (manual active).
2. Send/receive Stripe **cancellation** webhook — entitlement row should remain **manual** Pro (mirror may still update). Webhook logs may note manual skip.
3. **`npm run entitlement:revoke`**.
4. Re-activate Stripe subscription / new checkout — **`provider`** Pro may restore.

---

## Troubleshooting

| Symptom | Things to verify |
|---------|-------------------|
| `403 billing_disabled` on checkout | `PROMI_BILLING_ENABLED` + `PROMI_BILLING_PROVIDER=stripe` |
| `503 billing_misconfigured` | `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, canonical app URL resolved |
| Webhook **`400 invalid_signature`** | **`STRIPE_WEBHOOK_SECRET`** matches forwarding listener or Dashboard endpoint secret; body must be raw (Promi route already uses raw body) |
| Mirrors written, **no entitlement** | Active **manual lock**; or Stripe status maps to **`free`**; check webhook JSON `ignored`/`note` in app logs |
| **`subscription_no_owner_resolution`** | Use Promi-created Checkout (**13.2.4** sets metadata); or ensure **`billing_customers`** links customer id |

---

## Related docs

- **`docs/PHASE13_2_BILLING_PLAN.md`** — architecture, rollout, entitlement mapping  
- **`docs/PHASE13_2_6_STRIPE_DOWNGRADE_EVIDENCE.md`** — cancel / downgrade rehearsal (**13.2.6**) after subscribe proof  
- **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`** — soak / monitoring (**13.2.7**)  
- **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`** — manual lock Scenario **B** (**13.2.8**)  
- **`docs/DEVELOPMENT.md`** — env reference, Stripe webhook + checkout notes  
- **`docs/INTERNAL_BETA_RUNBOOK.md`** — operational context  
- **`docs/PHASE13_1_F_ENTITLEMENT_SMOKE_EVIDENCE.md`** — manual entitlement smoke (orthogonal)

# Phase 13.2.8 — Manual override protection rehearsal (Scenario B evidence)

**Purpose:** Record verification that **`owner_entitlements` manual lock** blocks **Stripe provider** downgrades/reconciles correctly while **`billing_subscriptions`** mirror still updates — policy in **`docs/PHASE13_2_BILLING_PLAN.md`** § manual override (**13.2.3**).

**Depends on:**

- Billing ingest **ON** (**`PROMI_BILLING_ENABLED=1`**, **`PROMI_BILLING_PROVIDER=stripe`**) during webhook steps.
- A **Stripe test-mode** subscription for the rehearsal owner (**Phase 13.2.5** path or new Checkout).

**`npm run billing:health` expectation:** Critical checks **`mirror_terminal_but_provider_entitlement_still_pro`** and **`mirror_billable_but_provider_entitlement_not_pro_active`** join only **`source=provider`** entitlements — a **manual** Pro row with canceled mirror typically produces **critical count 0**. **`provider_pro_entitlement_without_billable_stripe_mirror`** also targets **`provider`** source only — manual lock period should remain **PASS** if documented.

---

## Rehearsal status (latest recorded run)

| Field | Value |
|--------|--------|
| Last updated | **2026-05-05** _(exact local time retained in operator notes if needed)_ |
| Scenario B outcome | **PASS** |
| Manual override protection | **PASS** _(active manual lock retained through **`customer.subscription.deleted`**)_ |_
| Stripe test-mode billing manual-lock behavior | **Validated** |
| Public paid launch | **Still NO-GO** until live-mode readiness and explicit sign-off |
| Stripe mode | **test** |
| Sign-off (name / role) | _(optional formal sign-off line)_ |

---

## Recorded evidence — Scenario B (**PASS**, 2026-05-05)

### Global

| Field | Value |
|--------|--------|
| Date/time | **2026-05-05** _(use operator-provided local run time in internal log for precision)_ |
| Environment | **Local** — **Stripe test mode** |
| Commit SHA | As at rehearsal (`git rev-parse HEAD` in that workspace) |
| Operator | _(local operator)_ |
| **ownerId** | **`local-dev-user`** |
| **Stripe subscription id** (`sub_…`) | _(retained in operator / Stripe Dashboard test data; not pasted here)_ |

### Step 3 — Grant manual lock

```bash
npm run entitlement:grant -- --ownerId=local-dev-user --confirm --notes=phase13_2_8_manual_lock
```

| Field | Value |
|--------|--------|
| CLI result | **OK** — Manual Pro **grant applied** |
| `owner_entitlements` after (`plan_tier` / `status` / `source`) | **pro / active / manual** |

### Step 4 — `/upgrade` after grant

| Field | Value |
|--------|--------|
| Pill label | **Pro — manual approval** |

### Step 5–6 — Provider cancel while manual lock active

| Field | Value |
|--------|--------|
| **Event received** | **`customer.subscription.deleted`** |
| Webhook **HTTP** | **200** |
| **`billing_webhook_events`** | **`processed_at` set** _(ingest completed)_ |
| **`billing_subscriptions`** | Mirror updated to **canceled** (terminal) |
| **`owner_entitlements`** | Remained **pro / active / manual** (active manual override **not** downgraded by webhook) |
| **`entitlement_audit_logs`** | No **`provider_sync`** downgrade that overwrote the manual row _(expected skip path)_ |

### `/upgrade` after provider event

| Field | Value |
|--------|--------|
| Pill label | **Pro — manual approval** _(unchanged)_ |

### Billing health — after manual + canceled mirror

```bash
npm run billing:health
```

| Metric | Value |
|--------|--------|
| Exit code | **0** (PASS) |
| `pending_webhook_events_stale` | **0** |
| `mirror_billable_but_provider_entitlement_not_pro_active` | **0** |
| `mirror_terminal_but_provider_entitlement_still_pro` | **0** |
| `provider_pro_entitlement_without_billable_stripe_mirror` | **0** |

---

### Steps 7–8 — Manual revoke _(extended checklist — not described in this submission)_

```bash
npm run entitlement:revoke -- --ownerId=local-dev-user --confirm --notes=phase13_2_8_manual_unlock
```

| Field | Value |
|--------|--------|
| CLI result | _(not recorded in this submission — run when full lifecycle evidence is required)_ |
| **`owner_entitlements`** after | |
| **`/upgrade` after revoke** | |

**`npm run billing:health` after revoke** (Stripe sub still terminal):

| Expected | Notes |
|---------|-------|
| If mirror **canceled** and entitlement synced to **free**/provider canceled | **`billing:health` OK** typical |
| If webhook not yet reapplied entitlement | May need refresh / wait for Stripe replay — record |

---

### Step 9 (optional restore) — Provider Pro again

| Field | Value |
|--------|--------|
| Trigger | New Checkout / resumed subscription |
| **`owner_entitlements`** after active webhook | **pro / provider** if mapping applies |

---

## GO / NO-GO — manual override protection (test mode)

**Recorded (2026-05-05):** **PASS** — manual lock **validated** through **`customer.subscription.deleted`**: mirror **canceled**, **`owner_entitlements`** **manual Pro** preserved, **`/upgrade`** **Pro — manual approval**, **`billing:health`** all **critical** counts **0**.

| Decision | Criteria |
|----------|----------|
| **PASS** (recorded scope) | Manual lock blocks provider entitlement downgrade during **`customer.subscription.deleted`**; mirror updates; no erroneous **`provider_sync`** downgrade of manual row; **`billing:health`** **PASS** as listed. |
| **Extended checklist** | Steps **7–8** (revoke) and **9** (restore) — complete separately if sign-off requires full lifecycle. |
| **FAIL** | Webhook clears manual Pro unintentionally **or** critical drift unrelated to waiver |

_(Public paid SaaS stays **NO-GO** until live-mode readiness and explicit sign-off.)_

### Known issues / follow-ups

- Optionally record **revoke** / **post-revoke** **`billing:health`** using the template above for a complete end-to-end Scenario **B** closure. 

---

## Related docs

- **`docs/PHASE13_2_6_STRIPE_DOWNGRADE_EVIDENCE.md`** — Scenario **A** (provider downgrade without manual lock).
- **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`** — **`billing:health`**, soak, live consideration.
- **`docs/PHASE13_2_BILLING_PLAN.md`** — manual override policy table.
- **`docs/DEVELOPMENT.md`**

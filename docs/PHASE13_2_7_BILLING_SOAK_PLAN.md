# Phase 13.2.7 — Billing production-readiness soak / monitoring plan

**Purpose:** Define **how operators observe Stripe billing health** before any **Stripe live keys** or **public paid launch**, and capture **GO/NO-GO** prerequisites beyond Phase **13.2.5** subscribe and **13.2.6** downgrade evidence.

**Scope:**

- Observability gaps, DB-backed consistency checks, runbook rollback, human sign-off.
- **Does not** enable live mode or change application billing logic — process and tooling only.

**Evidence already required elsewhere:**

- **`docs/PHASE13_2_5_STRIPE_E2E_EVIDENCE.md`** — test Checkout → webhook → upgrade.
- **`docs/PHASE13_2_6_STRIPE_DOWNGRADE_EVIDENCE.md`** — test cancel/downgrade **Scenario A** (provider entitlement path).
- **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`** — manual lock **Scenario B** (recommended before Stripe **live keys** unless explicitly waived).

**`billing:health` + manual lock:** Critical checks only inspect **`owner_entitlements.source=provider`** for mirror vs entitlement drift. A canceled **`billing_subscriptions`** row alongside **manual** Pro is **normal** during Scenario **B** and should **not** trip **CRITICAL** by design (**`mirror_terminal_but_provider_entitlement_still_pro`** excludes **`manual`** rows).

---

## Current observability (audit)

| Surface | Role | Limits |
|---------|------|--------|
| **`billing_webhook_events`** | Idempotent ingest; **`processed_at`** marks successful mirror + entitlement slice | Rows **without** **`processed_at`** older than the retry SLA indicate stuck/failed processing (Stripe retries on **500**). |
| **`billing_customers`** | Links **`owner_id`** ↔ Stripe **`customer`** | Inspect when owner resolution fails for subscription events. |
| **`billing_subscriptions`** | Stripe subscription mirror (**`status`**, periods) | Source of truth for comparing against **`owner_entitlements`** when **`source=provider`**. |
| **`owner_entitlements`** | Resolver authority for tier | **`source=manual`** locks block provider downgrade (mirrors still update). |
| **`entitlement_audit_logs`** | Grant/revoke **`provider_sync`** trails | **`notes`** are **`event.type:event.id`** — no raw payloads — use for timelines. |
| Stripe CLI / local docs | **`docs/DEVELOPMENT.md`**, webhook route | Test-mode rehearsal only unless extended with **live endpoint** checklist (still **NO-GO** without sign-off). |
| **`INTERNAL_BETA_RUNBOOK.md` / `INTERNAL_BETA_CHECKLIST.md`** | Ops context | Extended in **13.2.7** for **`npm run billing:health`** and soak cadence. |
| Application logs | Webhook handler **`console.info`** summaries | Track **`mirrored`**, **`ignored`**, **`entitlementSkippedManual`** — **never** log secrets or full payloads. |

**Outside the DB:** HTTP **5xx** rate on **`POST /api/webhooks/billing/stripe`**, Stripe Dashboard event delivery failures, and alerting (Datadog / CloudWatch / host logs) must be configured for the **production deployment** that will eventually receive **live** webhooks — implementation is **host-specific**; this doc records **what** to watch, not **which** vendor.

---

## Monitoring checks (definitions)

### Tier 1 — DB script (`npm run billing:health`)

Read-only **counts only** (no owner ids, no Stripe ids, no mutation). **Critical** checks exit **non-zero**:

| Check | Meaning |
|-------|--------|
| **`pending_webhook_events_stale`** | **`processed_at IS NULL`** and **`created_at`** older than **`PROMI_BILLING_HEALTH_PENDING_MINUTES`** (default **30**). Indicates processing never completed for that event id — investigate logs and Stripe retries. |
| **`mirror_billable_but_provider_entitlement_not_pro_active`** | Stripe mirror **`active`/`trialing`/`past_due`** but **`owner_entitlements`** is **`source=provider`** and not in a billable Pro-shaped state. |
| **`mirror_terminal_but_provider_entitlement_still_pro`** | Mirror terminal (**`canceled`**, **`unpaid`**, **`paused`**, **`incomplete*`**) but **`owner_entitlements`** still **`provider` Pro** with active-ish status (and not expired). **Excludes** manual rows by construction (join condition **`source=provider`**). |
| **`provider_pro_entitlement_without_billable_stripe_mirror`** | **`source=provider`** Pro with **`active`/`trialing`/`past_due`** entitlement but **no** billable Stripe **`billing_subscriptions`** row — orphan provider entitlement vs mirror. |

**Warnings / info (non-blocking):**

| Check | Meaning |
|-------|--------|
| **`owners_with_multiple_billable_stripe_subscriptions`** | Same **`owner_id`** with more than one billable Stripe row — rare; reconcile in Stripe Dashboard. |
| **`active_manual_pro_lock_rows_review`** | Count of **`manual`** Pro locks — operational awareness (not automatically bad). |

**Not in SQL (monitor elsewhere):**

- Repeated webhook **HTTP 500** or timeout spikes → logs + reverse proxy metrics.
- Stripe signature failures **400** — often misconfigured **`STRIPE_WEBHOOK_SECRET`** on deploy rotations.
- **past_due** aging — Stripe dunning handles billing; ops may set calendar review for long-lived **`past_due`** with business policy (**resolver** still treats **`past_due`** as **Pro** by design).

### Tier 2 — periodic manual / SQL review

Run in staging or prod read-replica according to policy:

```sql
-- Example: webhook backlog (counts only — adjust timezone in reporting)
SELECT event_type,
       COUNT(*) FILTER (WHERE processed_at IS NULL) AS pending,
       COUNT(*) FILTER (WHERE processed_at IS NOT NULL) AS processed
FROM billing_webhook_events
WHERE provider = 'stripe'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY event_type;
```

Operators cross-check **Stripe Dashboard subscription list** vs **`billing_subscriptions`** for sampled owners **after incidents** — full reconciliation is Stripe’s source; Promi mirrors are **derived**.

---

## Rollback procedure (Stripe billing stress or bad deploy)

Goal: stop **automatic** billing-driven entitlement changes and **hosted Checkout** visibility while preserving **manual** operations and **forensic** rows.

1. **`PROMI_BILLING_ENABLED=0`** (or unset/false) — webhook handler **returns `200` with `persisted: false`** and **does not** write **`billing_webhook_events`** or mutate mirrors (`app/api/webhooks/billing/stripe/route.ts`).
2. **Checkout CTA** — already hidden when billing not fully configured; disabling **`PROMI_BILLING_ENABLED`** aligns with **`isStripeHostedCheckoutOfferedServer()`** prerequisites (operators should verify **`/upgrade`** shows no **Continue with Stripe Checkout**).
3. **Manual approval path** stays available — **`PROMI_UPGRADE_REQUEST_EMAIL`**, copy flow, **`npm run entitlement:grant` / `entitlement:revoke`** unchanged.
4. **Correct mistaken entitlements** with **`npm run entitlement:manage -- --action=status|grant|revoke`** (with **`--confirm`**) — document operator and notes.
5. **Preserve** **`billing_*`** and **`billing_webhook_events`** for investigation — **do not delete** webhook rows routinely.
6. **Stripe Dashboard:** cancel offending subscriptions / pause Billing if needed — Promi rollback does **not** replace Stripe-side cleanup.
7. **Redeploy** or revert bad code after RCA; replay failed webhooks from Stripe Dashboard only after fix is validated in **test** mode first.

---

## GO / NO-GO for **live-mode consideration** (not permission to launch)

**GO prerequisites (all required unless explicitly waived by approvers in writing):**

| # | Requirement |
|---|--------------|
| 1 | Phase **13.2.5** test Checkout → upgrade **PASS** (recorded). |
| 2 | Phase **13.2.6** Scenario **A** test cancel/downgrade **PASS** (recorded). |
| 3 | Phase **13.2.8** manual override (**Scenario B**) **PASS** (recorded), **unless** approvers waive in writing (**`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`**). |
| 4 | **`npm run billing:health`** **PASS** (zero critical counts) against target DB **before** cutover rehearsal. |
| 5 | **Webhook backlog:** no sustained **`processed_at` lag** for new events beyond agreed SLA (**script uses stale threshold**; zero critical stale rows at cutover rehearsal). |
| 6 | **No entitlement/subscription mismatch** critical signals from **`billing:health`** and spot SQL (**document** intentional manual+canceled mirror if reviewing). |
| 7 | **Manual override policy** documented and rehearsed (**`docs/PHASE13_2_BILLING_PLAN.md`** § manual override **+ Phase 13.2.8** evidence or waiver). |
| 8 | **Rollback procedure** rehearsed (**this doc** § rollback) plus **Approver sign-off** (name, role, date) for **moving to Stripe live keys** or **opening paid checkout to non-testers**. Further **Production** cutover detail: **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`**. |

**NO-GO if:**

| Condition |
|-----------|
| Webhook processing errors **persist** (repeated **500**, growing **`processed_at` null`** backlog without explanation). |
| **`owner_entitlements`** diverges from **`billing_subscriptions`** for **`source=provider`** without a documented **manual** lock or acknowledged incident workaround. |
| **Stripe live** API keys (`sk_live_*`) enabled in Promi deployment **without** runbook evidence and approver record. |
| **Checkout UI** or messaging implies **paid self-serve** before **explicit** product/compliance sign-off. |

**Still NO-GO for “public SaaS launch” until** positioning, soak duration, incident response, and any legal/commercial checks are satisfied — track live cutover specifics in **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`** (**13.2.9**) and release management.

---

## Soak cadence (suggested before live)

| When | Activity |
|------|----------|
| During test-mode rehearsals | Run **`billing:health`** after each rehearsal day. |
| Pre-staging freeze | **`billing:health`** + webhook backlog SQL + **`entitlement:audit`** sample owners. |
| Weekly in billing-enabled staging | Same + review **WARN** duplicates and **manual** lock count drift. |

---

## Lightweight script reference

```bash
npm run billing:health
# Optional: PROMI_BILLING_HEALTH_PENDING_MINUTES=60 npm run billing:health
```

---

## Related docs

- **`docs/PHASE13_2_BILLING_PLAN.md`**
- **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`** — Stripe live-mode readiness (**13.2.9**)
- **`docs/DEVELOPMENT.md`**
- **`docs/INTERNAL_BETA_RUNBOOK.md`**
- **`docs/INTERNAL_BETA_CHECKLIST.md`**
- **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`** — manual lock rehearsal (Scenario B)

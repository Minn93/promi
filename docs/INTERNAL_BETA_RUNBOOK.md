# Promi internal beta deployment runbook

This runbook is for **internal beta only**. It does not enable public SaaS mode.

## 1) Required environment setup

Set these for production internal beta deployments:

- `NODE_ENV=production`
- `PROMI_INTERNAL_BETA_MODE=1`
- `NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE=1`
- `PROMI_INTERNAL_BETA_OWNER_ID=<single-owner-id>`
- `DATABASE_URL`
- `CRON_SECRET`
- `OPENAI_API_KEY`

Optional, feature-specific:

- `OPENAI_MODEL`
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_OAUTH_REDIRECT_URI`
- `X_REAL_PUBLISHING`
- `X_API_BASE_URL`

Notes:

- Do not store secrets in repo files.
- Do not set `PROMI_INTERNAL_BETA_MODE=0` for internal beta deployments.
- Auth.js real-auth env vars (`AUTH_SECRET`, `AUTH_USER_EMAIL`, `AUTH_USER_PASSWORD`) are not required for internal beta mode.

## 2) Local preflight before deployment

Run:

```bash
npm run preflight:internal-beta
```

This runs:

- `npm run check:internal-beta`
- `npm run validate:owner-ids`
- `npm run build`

For release-candidate rehearsal execution and evidence capture, use:

- `docs/INTERNAL_BETA_RELEASE_REHEARSAL.md`

Owner-id schema preflight for Phase 12.1-E/12.1-F:

```bash
npm run backfill:owner-ids
npm run validate:owner-ids
```

Requirement: `npm run validate:owner-ids` must pass before applying owner-id `NOT NULL` constraints.

### Manual owner entitlements (Phase 13.1-D)

Operators with database access can upsert `owner_entitlements` from a secure machine (no unauthenticated API).

**Inspect current row (or absence):**

```bash
npm run entitlement:manage -- --action=status --ownerId=<owner_id>
```

Smoke evidence template / recorded runs: **`docs/PHASE13_1_F_ENTITLEMENT_SMOKE_EVIDENCE.md`**.

**Read-only entitlement audit tail (verification / Phase 13.1-F):**

```bash
npm run entitlement:audit -- --ownerId=<owner_id>
```

**Grant Pro (manual, audited):**

```bash
npm run entitlement:manage -- --action=grant --ownerId=<owner_id> --confirm
```

**Revoke to free/inactive (manual, audited):**

```bash
npm run entitlement:manage -- --action=revoke --ownerId=<owner_id> --confirm
```

**Closed-beta Pro enrollment (Phase 13.1-E, no payments):**

1. User visits `/upgrade` and submits a manual request (mailto when host sets `PROMI_UPGRADE_REQUEST_EMAIL`, otherwise copy/paste includes `ownerId`).
2. Operator runs `npm run entitlement:grant -- --ownerId=<owner_id>` (wrapper includes `--confirm`; same effect as `entitlement:manage --action=grant --confirm`) from a secure shell with DB access.
3. User refreshes the app — scheduling/OAuth limits and UI follow `getPlanTierForOwner` (`owner_entitlements` first); localStorage/mock upgrade UI is not authoritative.

**Operator-enabled Stripe Checkout (Phase 13.2.4, rehearsal-only default):**

- **`POST /api/billing/checkout-session`** creates a Stripe **hosted** Checkout Session when **`PROMI_BILLING_ENABLED=1`**, **`PROMI_BILLING_PROVIDER=stripe`**, Stripe keys/`STRIPE_PRO_PRICE_ID`/canonical **`PROMI_APP_URL`** (or documented fallbacks) are set. Caller must be an **authenticated Promi owner** — **`owner_id`** is taken **only** from session (`getCurrentOwnerId`).
- Returning to **`/upgrade?checkout=success`** is **not** payment or entitlement proof. **Webhook delivery** (**`checkout.session.completed`**, **`customer.subscription.*`**) drives **`billing_*`** mirrors and then **`owner_entitlements`** (**`provider_sync`** audits). Use **Stripe test mode** until **Phase 13.2.5** captures E2E evidence.
- Public paid SaaS stays **NO-GO** until checkout + webhook rehearsals are evidenced end-to-end.

Optional env for upgrade mail drafts: `PROMI_UPGRADE_REQUEST_EMAIL`. Revoke follows the same playbook with `npm run entitlement:revoke -- --ownerId=<owner_id>`.

Production note: `/upgrade/checkout` and `/upgrade/success` redirect to `/upgrade` (`NODE_ENV=production`); they are legacy local-only **localStorage** tooling and must **not** be mistaken for Stripe Checkout.

### Stripe webhook receiver (Phase 13.2.3+ — mirror + provider entitlement sync)

- **POST** `https://<host>/api/webhooks/billing/stripe` — **no session / no cookies**; **Stripe signing secret only**; raw body verification.
- **`STRIPE_WEBHOOK_SECRET` + `STRIPE_SECRET_KEY`** required or the handler returns **`503`** (misconfiguration).
- **`PROMI_BILLING_ENABLED=1`** runs ingest + Billing mirror upserts **and** writes **`owner_entitlements`** **`source=provider`** when Stripe subscription state warrants it — **blocked** while an **active manual override** (`source=manual` + `status∈{active,manual}` + unexpired) is present (mirror still applies). **`checkout.session.completed`** (**subscription** mode) participates in the same mirror + entitlement path when **Promi server Checkout** set trusted **`client_reference_id` / `metadata.owner_id`** and subscription metadata matches (see **`docs/PHASE13_2_BILLING_PLAN.md`**).
- Audit trail: **`entitlement_audit_logs.action=provider_sync`**, **`notes`** like `customer.subscription.updated:evt_…` — never raw payloads.
- Verify combined state:
  - `npm run entitlement:manage -- --action=status --ownerId=<owner_id>`
  - Mirror tables via Prisma Studio / SQL as needed.
  - `npm run entitlement:audit -- --ownerId=<owner_id>` (includes provider-driven rows in the chronological feed).
```bash
stripe listen --forward-to localhost:3000/api/webhooks/billing/stripe
stripe trigger customer.subscription.created
```

Operational policy summary: **`docs/PHASE13_2_BILLING_PLAN.md`**. Paid public launch stays **NO-GO** until Checkout + soak complete.

After Phase 12.1-F, owner-id is required (`NOT NULL`) in:

- `scheduled_posts.owner_id`
- `post_history.owner_id`
- `publish_attempts.owner_id`

## 3) CI preflight gate

The repository includes:

- `.github/workflows/internal-beta-preflight.yml`

It validates internal-beta config and runs build checks on PRs/pushes to `main`.

Current CI gate commands:

- `npm run check:internal-beta`
- `npm run validate:owner-ids`
- `npm run build`

### Branch protection enforcement (required)

Configure this in GitHub:

1. Go to `Settings -> Branches -> Branch protection rules`.
2. Edit/add the rule for the protected branch (`main`).
3. Enable `Require status checks to pass before merging`.
4. Mark the preflight check as required:
   - `Internal Beta Preflight / internal-beta-preflight`

This prevents merges that skip internal-beta config validation, owner-id integrity validation, or build verification.

Repository configuration required:

- **Repository secrets**: `DATABASE_URL`, `CRON_SECRET`, `OPENAI_API_KEY`
- **Repository variables**: `PROMI_INTERNAL_BETA_OWNER_ID`
- Optional secrets/vars for X feature checks as needed

Security notes for owner-id validation in CI:

- `validate:owner-ids` requires `DATABASE_URL` and uses the same Prisma adapter/env pattern as local scripts.
- Validation output is count-only and does not print row content or secret values.

## 3.1) Owner-isolation regression signal (manual only)

Use this command for real-auth two-owner adversarial rehearsal evidence:

```bash
npm run smoke:owner-isolation
```

Run it:

- Before internal beta release-candidate GO decisions.
- After changes touching owner/auth/scheduled/history/connected-account isolation paths.
- In a dedicated non-prod rehearsal environment only.

Important:

- This smoke is **not** part of default PR preflight and is not required on every PR.
- Use manual workflow `.github/workflows/owner-isolation-smoke.yml` when CI execution is needed.
- Do not run against production data unless an explicit rehearsal is approved.

## 4) Deploy

1. Confirm preflight passed in CI.
2. Deploy with the required environment variables.
3. Verify app starts and shows internal-beta banner.

## 5) Post-deploy smoke test

- [ ] App loads and internal-beta banner is visible.
- [ ] Create/generate/edit works.
- [ ] Save draft works.
- [ ] Connect/reconnect X works (if X env is configured).
- [ ] Schedule post works.
- [ ] Scheduled queue shows the item.
- [ ] Trigger scheduler job and verify due item is processed.
- [ ] History shows result.
- [ ] `/upgrade` shows manual approval / server entitlement framing; **self-serve Stripe** appears **only** when billing flags + Stripe env are intentionally enabled (default: hidden).
- [ ] Opening `/upgrade/checkout` or `/upgrade/success` in production redirects to `/upgrade`; dev-only playground is not linked in production.
- [ ] Safety block appears if `PROMI_INTERNAL_BETA_MODE=0` is attempted in production.

## 6) Scheduler job test

Production-style call:

- `POST /api/jobs/process-due-scheduled-posts?limit=20`
- Header: `Authorization: Bearer <CRON_SECRET>`

Verify job response and Scheduled/History updates.

## 7) OAuth reconnect check

1. Use a post/account path that surfaces reconnect guidance.
2. Start reconnect from UI (`/settings/accounts` or action links).
3. Verify callback completes and account status updates.

## 8) Owner isolation adversarial smoke (real-auth mode)

Use two real-auth users (Owner A / Owner B) and verify cross-owner access is blocked:

1. As Owner B, create at least one scheduled post and capture `scheduledPostId`.
2. Switch to Owner A and call:
   - `GET /api/scheduled-posts/{scheduledPostId}`
   - `PATCH /api/scheduled-posts/{scheduledPostId}/edit`
   - `POST /api/scheduled-posts/{scheduledPostId}/retry`
   - `PATCH /api/scheduled-posts/{scheduledPostId}` (cancel)
   - `GET /api/post-history?scheduledPostId={scheduledPostId}`
3. Confirm no cross-owner data is returned and mutating calls do not succeed.
4. Confirm Owner A analytics page only reflects Owner A published posts.
5. Confirm connected accounts list/disconnect remain owner-scoped for Owner A.

Record in deployment evidence:

- Adversarial smoke result: PASS/FAIL
- Any blocked endpoint anomalies

## 9) Rollback guidance

If deployment is unhealthy:

1. Roll back to previous known-good build.
2. Keep `PROMI_INTERNAL_BETA_MODE=1`.
3. Re-run `npm run check:internal-beta` against deploy env values.
4. Re-run smoke checklist before re-promoting.

If owner-id validation/migration work is in progress:

1. If `npm run validate:owner-ids` fails, stop and do not apply `NOT NULL` constraints.
2. If a constraint migration fails, keep nullable schema and inspect the failing rows.
3. Avoid deleting rows as a rollback mechanism; correct owner ids and rerun validation.

## 10) Deployment evidence record (required)

Record this for each production internal-beta rollout:

- Date/time (UTC and local timezone)
- Environment (`production-internal-beta`)
- Commit SHA
- Preflight result (`npm run preflight:internal-beta` or CI gate)
- `npm run validate:owner-ids` result (pass/fail + summary counts)
- Post-deploy smoke result (pass/fail + key notes)
- Adversarial smoke result (pass/fail + notes)
- GO/NO-GO decision and approver

Template:

```text
Date/time:
Environment:
Commit SHA:
Preflight result:
validate:owner-ids result:
Post-deploy smoke result:
Adversarial smoke result:
GO/NO-GO decision:
Approver:
Notes:
```

Future hardening idea (documentation-only): add a read-only periodic integrity check runbook step that executes `npm run validate:owner-ids` on production data and records evidence without applying data changes.

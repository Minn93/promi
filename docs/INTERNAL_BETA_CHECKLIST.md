# Promi internal beta checklist

Use this checklist before sharing a deployment with internal testers.

For release-candidate rehearsal criteria + evidence recording, see:

- `docs/INTERNAL_BETA_RELEASE_REHEARSAL.md`

## Deployment profiles

### 1) Local development

Required for app boot:

- `DATABASE_URL`

Recommended internal-beta flags (explicit even though defaults are internal beta):

- `PROMI_INTERNAL_BETA_MODE=1`
- `NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE=1`
- `PROMI_INTERNAL_BETA_OWNER_ID=local-dev-user`

Feature-specific env:

- Copy generation: `OPENAI_API_KEY` (plus optional `OPENAI_MODEL`)
- Scheduler auth tests: `CRON_SECRET` (or non-production bypass flag for local-only testing)
- Real X OAuth/publish path: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_OAUTH_REDIRECT_URI` (optional in internal beta)

### 2) Production internal beta (supported target)

Required:

- `NODE_ENV=production`
- `DATABASE_URL`
- `PROMI_INTERNAL_BETA_MODE=1`
- `NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE=1`
- `PROMI_INTERNAL_BETA_OWNER_ID=<explicit-single-owner-id>`
- `CRON_SECRET`
- `OPENAI_API_KEY` (required for core generate flow)

Optional (feature-level):

- `OPENAI_MODEL`
- `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_OAUTH_REDIRECT_URI`, `X_REAL_PUBLISHING`, `X_API_BASE_URL`

### 3) Unsafe/public mode blocked state (intentional safety behavior)

If:

- `NODE_ENV=production`
- `PROMI_INTERNAL_BETA_MODE=0`

Then:

- The app shell is blocked **unless** **`PROMI_AUTH_PRODUCT_READY=1`** (Phase **14.4** DB auth) and related auth env are set — see **`docs/PHASE14_4_AUTH_USER_MODEL.md`**. Unconfigured production without internal beta remains unsafe.

## Required guardrails checks

- [ ] `PROMI_INTERNAL_BETA_MODE=1` is set on the server runtime.
- [ ] `NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE=1` is set for client bundles.
- [ ] `PROMI_INTERNAL_BETA_OWNER_ID` is set to the intended single-owner id.
- [ ] Canonical production URL vars are aligned: `PROMI_APP_URL=https://usepromi.app`, `NEXT_PUBLIC_APP_URL=https://usepromi.app`, `NEXTAUTH_URL=https://usepromi.app`.
- [ ] User-facing login URL for beta testers is `https://usepromi.app/login` (do not rely on `/api/auth/signin` in tester instructions).
- [ ] `www.usepromi.app` is treated as secondary only; canonical links and redirects use `https://usepromi.app`.
- [ ] `promi-pi.vercel.app` remains reachable as deployment fallback and is not used as canonical URL.
- [ ] Verify the top banner is visible: `Internal beta mode: single-owner dev auth and simulated billing are enabled.`
- [ ] Confirm `/upgrade` explains closed-beta **manual approval** for Pro and shows **server** plan/entitlement state (not localStorage as authority).
- [ ] In production, confirm `/upgrade/checkout` and `/upgrade/success` redirect to `/upgrade` and are not used as a payment or upgrade path.
- [ ] Run `npm run check:internal-beta` and resolve all reported errors before rollout.
- [ ] Run `npm run validate:owner-ids` and resolve any blocking integrity errors before rollout.

## Safety checks

- [ ] CI workflow `Internal Beta Preflight` is passing.
- [ ] Branch protection for `main` requires status check `Internal Beta Preflight / internal-beta-preflight`.
- [ ] Repository secrets are configured for CI (`DATABASE_URL`, `CRON_SECRET`, `OPENAI_API_KEY`).
- [ ] Repository variable `PROMI_INTERNAL_BETA_OWNER_ID` is configured for CI.
- [ ] `npm run build` passes.
- [ ] `npm run validate:owner-ids` passes in the deploy target environment.
- [ ] `npm run preflight:internal-beta` passes locally before deployment.
- [ ] Scheduler auth is configured (`CRON_SECRET`) or dev bypass is intentionally enabled only outside production.
- [ ] OAuth connect/reconnect flow works for internal test accounts.
- [ ] Create -> schedule -> scheduled list -> job run -> history flow works end-to-end.
- [ ] Owner-isolation smoke is run for release candidates or isolation-sensitive changes (`npm run smoke:owner-isolation` in non-prod).
- [ ] Confirm owner-isolation smoke is **not** added to default PR preflight gates.
- [ ] If manual Pro is used: inspect entitlement with `npm run entitlement:manage -- --action=status --ownerId=<PROMI_INTERNAL_BETA_OWNER_ID>` — server limits follow `owner_entitlements`, not mock Upgrade UI.
- [ ] Optional Phase 13.1-F: run manual entitlement smoke per `docs/PHASE13_1_F_ENTITLEMENT_SMOKE_EVIDENCE.md` before release candidate if entitlements changed.
- [ ] **Phase 14.1:** `POST /api/generate` and `POST /api/uploads/scheduled-image` require resolved owner (`getCurrentOwnerId`) before OpenAI / disk write — see **`docs/PHASE14_SECURITY_SWEEP.md`**. Public launch remains **NO-GO** until broader auth, rate limits, and legal gates are satisfied.
- [ ] **Phase 14.3:** Auth MVP spec + readiness flags — **`docs/PHASE14_3_AUTH_MVP_SPEC.md`**. **`PROMI_AUTH_PRODUCT_READY`** is not a substitute for public launch gates.
- [ ] **Phase 14.4:** DB-backed Auth.js — **`docs/PHASE14_4_AUTH_USER_MODEL.md`**. Production **`PROMI_INTERNAL_BETA_MODE=0`** needs **`PROMI_AUTH_PRODUCT_READY=1`** + **`AUTH_SECRET`** to render the shell; create users with **`npm run auth:user`**. Public beta / open signup remains **NO-GO**.
- [ ] **Phase 14.6:** **`proxy.ts`** matcher + policy alignment — **`docs/PHASE14_ROUTE_PROTECTION_MATRIX.md`**. Real-auth anonymous users must not reach owner pages or cost APIs without JWT; webhooks/scheduler/auth routes stay off the matcher. **`/ops`** is operator-only (global aggregate); set **`PROMI_OPS_OWNER_IDS`** for real-auth local/staging. **Internal beta:** `proxy` still bypasses JWT — perimeter is single-owner env, not edge login. Public launch remains **NO-GO**.
- [ ] **Phase 14.7:** Auth one-time tokens + mail — **`docs/PHASE14_7_AUTH_TOKENS_MAIL.md`**. Run **`npx prisma migrate deploy`** (or **`migrate dev`**) so **`auth_one_time_tokens`** exists. For transactional email in staging/production, set **`RESEND_API_KEY`** and **`PROMI_MAIL_FROM`**. HTTP reset landed in **14.8**; invite HTTP in **14.9**; **rate limits in 14.10** — **`docs/PHASE14_10_RATE_LIMITS.md`**; public launch remains **NO-GO**.
- [ ] **Phase 14.8:** Password reset — **`docs/PHASE14_8_PASSWORD_RESET.md`**. Exercise **`/forgot-password`** → email or **`PROMI_AUTH_EMAIL_DEV_LOG`** → **`/reset-password`** → sign-in. **Rate limits:** **`docs/PHASE14_10_RATE_LIMITS.md`**. Invite accept + broader verification remain **NO-GO** for public launch.
- [ ] **Phase 14.9:** Invite onboarding — **`docs/PHASE14_9_INVITE_FLOW.md`**. Apply migration **`phase14_9_invite_nullable_password`**; use **`npm run auth:user -- --action=invite`**. Pending users have **`password_hash` NULL** until **`/accept-invite`**. **No public signup.** **Phase 14.10** rate limits apply when internal beta is off; Upstash required for product-ready production — **`docs/PHASE14_10_RATE_LIMITS.md`**. Public launch **NO-GO** until store is configured + broader gates.
- [ ] **Phase 14.10:** Rate limits (auth + cost APIs) — **`docs/PHASE14_10_RATE_LIMITS.md`**. **Internal beta:** limits **disabled**. **Product-ready production:** **`UPSTASH_REDIS_REST_URL`** + **`UPSTASH_REDIS_REST_TOKEN`** required (`check:internal-beta` gate). Manually verify **429** on repeated forgot/reset/accept/generate/upload where applicable. Public launch **NO-GO** until Redis is live and soak-tested.
- [ ] **Phase 14.11:** Account status gates — **`docs/PHASE14_11_ACCOUNT_STATUS_GATES.md`**. **Internal beta:** skipped. Re-check **`disabled`** / **`email_verified`** policy on gated APIs (including scheduled/history/accounts reads and OAuth callback parity); JWT not revoked on disable (see doc). Public launch **NO-GO**.
- [ ] **Phase 14.12:** Real-auth **DB user** full smoke (Credentials, two users, isolation, gates, rate limits, billing posture) — **`docs/PHASE14_12_REAL_AUTH_SMOKE.md`**. Not satisfied by **`npm run smoke:owner-isolation`** (synthetic JWT). Record evidence + closed-beta **GO/NO-GO** in doc. Public launch **NO-GO**.
- [ ] **Phase 14.14:** Disabled-session strategy + remaining gate audit. Keep route-level DB rechecks on owner-sensitive handlers/pages; do **not** assume global JWT revocation. Run compact smoke from **`docs/PHASE14_11_ACCOUNT_STATUS_GATES.md`** (disabled blocked on read + mutation; re-enabled user regains access; internal beta unchanged).
- [ ] **Phase 14.15:** Closed beta GO/NO-GO decision artifact completed — **`docs/PHASE14_15_CLOSED_BETA_READINESS.md`**. Invite-only external testers require explicit decision record + approver.
- [ ] **Phase 14.16:** First external tester controlled rollout rehearsal completed — **`docs/PHASE14_16_FIRST_TESTER_ROLLOUT.md`** (operator, approver, tester alias/email handling, smoke + rollback evidence).
- [x] **Phase 14.17:** First tester execution evidence recorded — **`docs/PHASE14_17_FIRST_TESTER_EVIDENCE.md`** (single tester rehearsal PASS).
- [ ] **Phase 14.18A:** Multi-account self-test rehearsal evidence completed — **`docs/PHASE14_18A_MULTI_ACCOUNT_SELF_TEST_EVIDENCE.md`** (operator-controlled 3-5 account matrix + self-test GO gate; not external cohort completion).
- [ ] If **`PROMI_BILLING_ENABLED=1`** and Stripe Checkout is intentional for rehearsal: capture **Phase 13.2.5** Stripe **test-mode** Checkout → webhook E2E in **`docs/PHASE13_2_5_STRIPE_E2E_EVIDENCE.md`**, **Phase 13.2.6** Scenario **A** cancel/downgrade in **`docs/PHASE13_2_6_STRIPE_DOWNGRADE_EVIDENCE.md`**, **Phase 13.2.8** manual lock **Scenario B** in **`docs/PHASE13_2_8_MANUAL_OVERRIDE_EVIDENCE.md`** (or obtain written waiver per **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`**), and follow **Phase 13.2.7** soak/monitoring in **`docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`** (run **`npm run billing:health`** on a schedule for that environment). Billing remains **OFF** by default; public paid launch stays **NO-GO** until evidence, health checks, and stakeholders sign off.
- [ ] Before **Stripe live** API keys (`sk_live_*`), live webhook signing secret, or **live** **`STRIPE_PRO_PRICE_ID`** on **Production**: complete **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`** gates — env separation (**Vercel Production** vs Preview), live webhook URL **`/api/webhooks/billing/stripe`**, commerce/compliance checklist, monitoring/rollback familiarity, controlled live rehearsal plan, and **live-mode GO/NO-GO** approval recorded.
- [ ] Stripe **test-mode** billing evidence does **not** authorize **live** keys by itself — **13.2.9** planning + rehearsal + sign-off are additional.

## Post X callback live-domain verification (production canonical host)

Run after updating X Developer Portal settings to production URLs:

- [x] `https://usepromi.app/terms` loads successfully.
- [x] `https://usepromi.app/privacy` loads successfully.
- [x] X OAuth start is initiated from `https://usepromi.app` (not `www` / `vercel.app` host).
- [x] X OAuth callback returns to `https://usepromi.app/api/oauth/x/callback`.
- [x] Successful OAuth callback handling redirects to `https://usepromi.app/settings/accounts?connected=x`.
- [x] Connected account row/UI is created or updated correctly after callback.
- [x] X schedule/publish flow still works after reconnect.
- [x] No generated canonical link for app/auth/email flows uses `example.com`, `www.usepromi.app`, or `promi-pi.vercel.app`.
- [x] `/ops` remains operator-only and blocked for non-operator users (`404 / Not Found` observed in production smoke).
- [x] Invite-only posture remains unchanged (no public signup/public-launch messaging introduced).

### Latest production single-account smoke (canonical domain)

- [x] Login at `https://usepromi.app/login`: PASS
- [x] Non-operator `/ops` access: PASS (`404 / Not Found`)
- [x] X login/connect flow: PASS
- [x] Schedule/upload flow: PASS
- [x] History display: PASS
- [x] Owner isolation (no other account data visible): PASS
- [x] **Phase 14.18A multi-account self-test is ready to begin** (start with 3 accounts under invite-only posture).

## Deployment evidence (record for each rollout)

- [ ] Date/time captured (UTC + local timezone)
- [ ] Environment recorded (`production-internal-beta`)
- [ ] Commit SHA recorded
- [ ] Preflight result recorded (`preflight:internal-beta` or CI gate)
- [ ] `validate:owner-ids` result recorded
- [ ] Post-deploy smoke result recorded
- [ ] GO/NO-GO decision recorded
- [ ] Approver recorded
- [ ] If inviting external testers: attach **Phase 14.15** decision table and accepted-risk notes.

## Owner isolation adversarial smoke (real-auth mode)

Run this before promoting any release candidate that changes owner-scoped routes.

- [ ] Owner A cannot `GET /api/scheduled-posts/{ownerBPostId}` (expect `404`).
- [ ] Owner A cannot `PATCH /api/scheduled-posts/{ownerBPostId}/edit` (expect `404`).
- [ ] Owner A cannot `POST /api/scheduled-posts/{ownerBPostId}/retry` (expect `404`).
- [ ] Owner A cannot `PATCH /api/scheduled-posts/{ownerBPostId}` cancel (expect `404`).
- [ ] Owner A cannot read Owner B history via `GET /api/post-history?scheduledPostId={ownerBPostId}` (expect empty data/`404` behavior, no cross-owner rows).
- [ ] Owner A analytics only reflect Owner A published rows.
- [ ] Owner A cannot connect/disconnect Owner B connected account IDs.
- [ ] Evidence record is completed with a named human approver before GO.

## Internal-beta safety regression smoke

- [ ] In internal-beta mode, single-owner scheduled/history/analytics/accounts flow still works end-to-end.

## Disabled-session regression smoke (real-auth mode)

- [ ] Disabled logged-in user is blocked on owner read APIs (`/api/scheduled-posts`, `/api/scheduled-posts/[id]`, `/api/post-history`, `/api/connected-accounts`).
- [ ] Disabled logged-in user is blocked on mutation/cost APIs (`/api/generate`, `/api/uploads/scheduled-image`, scheduled create/edit/retry/cancel, billing checkout-session, connected-account disconnect).
- [ ] Re-enable the same user and confirm expected access resumes.
- [ ] Internal beta behavior remains unchanged with `PROMI_INTERNAL_BETA_MODE=1`.

## First external tester rehearsal (invite-only)

- [ ] First-tester runbook record completed (`docs/PHASE14_16_FIRST_TESTER_ROLLOUT.md`) with target environment, commit SHA, operator, approver, and tester alias.
- [ ] Invite command evidence captured; no raw tokens/secrets committed.
- [ ] Accept-invite -> login -> create/generate/schedule -> history smoke captured.
- [ ] `/ops` access remains operator-only for tester account.
- [ ] Rollback owner confirmed and rollback drill commands verified.

## Remaining partial items (post-14.17)

- Billing remains **test/manual** posture (no live paid launch).
- Non-X real publish parity remains partial (Instagram/Facebook real publish not yet parity with X path).
- Wider operational maturity/monitoring for broader cohort remains partial.
- `/ops` remains intentionally restricted operator-only global aggregate surface.

## Multi-account self-test runbook (Phase 14.18A)

- [ ] Create or prepare 3-5 test emails/accounts.
- [ ] Invite each test account (`auth:user invite`) and record safe evidence.
- [ ] Complete full core flow per account (accept invite -> login -> generate/create -> schedule/history/published checks).
- [ ] Logout/sign-out works and returns to `/login` before switching accounts.
- [ ] Switching accounts shows the correct signed-in email in Settings account overview.
- [ ] Verify owner isolation across accounts.
- [ ] Spot-check `/ops` remains blocked for all non-operator accounts.
- [ ] Record bugs/feedback and decide PASS/PARTIAL/FAIL in `docs/PHASE14_18A_MULTI_ACCOUNT_SELF_TEST_EVIDENCE.md`.

Latest recorded account execution (14.18A):

- [x] `tlsghktks8.2@gmail.com` (`ownerId=cmp6xp4kt0000kcsxkxvjthne`) completed PASS as a Free-plan rehearsal account:
  invite -> password setup -> login -> signed-in email visibility -> X connect -> create/generate -> schedule/upload -> history/published -> owner/drafts isolation -> logout redirect -> logged-out shell protection -> non-operator `/ops` 404.
- [ ] Remaining account executions pending (need at least 3 account-level PASS/PARTIAL results before final 14.18A gate decision).

## Must not ship as public SaaS yet

- Real auth/session provider for multi-tenant production.
- **Public** SaaS positioning with **Stripe live paid** checkout **without** **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`** GO + compliance/sign-off (**test-mode Stripe billing rehearsal may PASS while live remains gated**).
- Multi-tenant data isolation for scheduled/history resources scoped to authenticated tenants (beyond internal-beta single-owner posture).

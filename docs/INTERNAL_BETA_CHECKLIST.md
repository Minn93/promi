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

- App intentionally shows a safety block page at startup because real auth + real billing are not implemented yet.

## Required guardrails checks

- [ ] `PROMI_INTERNAL_BETA_MODE=1` is set on the server runtime.
- [ ] `NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE=1` is set for client bundles.
- [ ] `PROMI_INTERNAL_BETA_OWNER_ID` is set to the intended single-owner id.
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

## Deployment evidence (record for each rollout)

- [ ] Date/time captured (UTC + local timezone)
- [ ] Environment recorded (`production-internal-beta`)
- [ ] Commit SHA recorded
- [ ] Preflight result recorded (`preflight:internal-beta` or CI gate)
- [ ] `validate:owner-ids` result recorded
- [ ] Post-deploy smoke result recorded
- [ ] GO/NO-GO decision recorded
- [ ] Approver recorded

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

## Must not ship as public SaaS yet

- Real auth/session provider.
- Real payment provider integration.
- Multi-tenant data isolation for scheduled/history resources.

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
- [ ] Upgrade pages show simulated/internal-beta state.
- [ ] Production simulated billing actions are disabled.
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

## 8) Rollback guidance

If deployment is unhealthy:

1. Roll back to previous known-good build.
2. Keep `PROMI_INTERNAL_BETA_MODE=1`.
3. Re-run `npm run check:internal-beta` against deploy env values.
4. Re-run smoke checklist before re-promoting.

If owner-id validation/migration work is in progress:

1. If `npm run validate:owner-ids` fails, stop and do not apply `NOT NULL` constraints.
2. If a constraint migration fails, keep nullable schema and inspect the failing rows.
3. Avoid deleting rows as a rollback mechanism; correct owner ids and rerun validation.

## 9) Deployment evidence record (required)

Record this for each production internal-beta rollout:

- Date/time (UTC and local timezone)
- Environment (`production-internal-beta`)
- Commit SHA
- Preflight result (`npm run preflight:internal-beta` or CI gate)
- `npm run validate:owner-ids` result (pass/fail + summary counts)
- Post-deploy smoke result (pass/fail + key notes)
- GO/NO-GO decision and approver

Template:

```text
Date/time:
Environment:
Commit SHA:
Preflight result:
validate:owner-ids result:
Post-deploy smoke result:
GO/NO-GO decision:
Approver:
Notes:
```

Future hardening idea (documentation-only): add a read-only periodic integrity check runbook step that executes `npm run validate:owner-ids` on production data and records evidence without applying data changes.

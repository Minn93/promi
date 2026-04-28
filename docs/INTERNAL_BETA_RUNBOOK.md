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

## 2) Local preflight before deployment

Run:

```bash
npm run preflight:internal-beta
```

This runs:

- `npm run check:internal-beta`
- `npm run build`

For release-candidate rehearsal execution and evidence capture, use:

- `docs/INTERNAL_BETA_RELEASE_REHEARSAL.md`

## 3) CI preflight gate

The repository includes:

- `.github/workflows/internal-beta-preflight.yml`

It validates internal-beta config and runs build checks on PRs/pushes to `main`.

Repository configuration required:

- **Repository secrets**: `DATABASE_URL`, `CRON_SECRET`, `OPENAI_API_KEY`
- **Repository variables**: `PROMI_INTERNAL_BETA_OWNER_ID`
- Optional secrets/vars for X feature checks as needed

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

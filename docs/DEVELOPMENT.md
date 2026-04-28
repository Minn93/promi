# Promi — local development

Short reference for running the app and exercising publish / OAuth / scheduler flows after **3차**.

## Required

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (Next.js and Prisma CLI both read this; `.env` then `.env.local` overrides). |

Without `DATABASE_URL`, the app throws at Prisma client creation.

## Internal beta guardrails

Promi currently runs in **single-owner internal beta mode** by default.

| Variable | Purpose |
|----------|---------|
| `PROMI_INTERNAL_BETA_MODE` | Server guard. Default is internal beta (`1`/true). Set to `0` only when real auth + real billing are implemented. |
| `NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE` | Client-side mirror for safety messaging. Default is internal beta (`1`/true). |
| `PROMI_INTERNAL_BETA_OWNER_ID` | Optional single-owner id override. Defaults to `local-dev-user`. |

If production is deployed with `PROMI_INTERNAL_BETA_MODE=0`, the app now blocks startup to prevent accidental public-launch behavior while mock auth/billing assumptions still exist.

Validation command:

```bash
npm run check:internal-beta
```

The check script fails fast on missing required variables for the current mode and reports optional feature gaps as warnings.

Preflight command (recommended before deploy):

```bash
npm run preflight:internal-beta
```

This runs config validation and production build checks in one command.

## Optional — product / AI

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Copy generation in Create flow. |
| `OPENAI_MODEL` | Defaults to `gpt-4o-mini` if unset. |

## Optional — scheduler (due posts)

Production: `POST` or `GET` `/api/jobs/process-due-scheduled-posts` with header:

`Authorization: Bearer <CRON_SECRET>`

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Shared secret for scheduler requests (required in production for the job route). |

**Local bypass (never enable in production):**

| Variable | Purpose |
|----------|---------|
| `ALLOW_UNAUTH_SCHEDULER_DEV=1` | Only when `NODE_ENV !== "production"`, allows calling the scheduler **without** `Authorization`. Use in `.env.local` only. |

Example (PowerShell):

```powershell
Invoke-WebRequest -Method POST "http://localhost:3000/api/jobs/process-due-scheduled-posts?limit=20"
```

With bypass: no header. Without bypass: `Authorization: Bearer $env:CRON_SECRET`.

## Optional — X OAuth + publish

| Variable | Purpose |
|----------|---------|
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | OAuth app credentials. |
| `X_OAUTH_REDIRECT_URI` | Must match the callback URL registered for the X app (see `src/lib/platform-auth/x-config.ts`). |
| `X_REAL_PUBLISHING` | `1` = call the real X API for text tweets when the connected account is not a mock token. Anything else = **mock X publish** (no network to X). |
| `X_API_BASE_URL` | Override API host (default `https://api.x.com`). |

Scheduled publish (`publishPost`) will **refresh the X access token** using the stored `refresh_token` when the token is expired or within ~2 minutes of expiry, and will **retry the tweet once** if the X API returns **401** after a refresh. Scopes must include **`offline.access`** so X returns a refresh token (see `src/lib/platform-auth/x.ts`). Failures use `TOKEN_REFRESH_FAILED` or `X_AUTH_REQUIRED` (reconnect in the Scheduled UI).

### Mock vs real X

- **`X_REAL_PUBLISHING` unset or not `1`:** X posts use the mock publisher path (simulated success; message notes that real publish is disabled).
- **`X_REAL_PUBLISHING=1`:** Validates OAuth client config, rejects mock-style accounts/tokens, and uses the user’s stored access token to `POST /2/tweets`.

Instagram/Facebook OAuth env vars exist for stubs; real publish for those platforms is still mock-only (see `TODO(4차-publish)` in `src/lib/platforms/index.ts`).

## Optional — debugging DB wiring

| Variable | Purpose |
|----------|---------|
| `PRISMA_DEBUG_DATABASE_URL=1` | Logs a **masked** `DATABASE_URL` from `prisma.config.ts` (CLI/Studio) and from `lib/prisma.ts` (runtime) when set. |

## Manual sanity check (3차)

1. `npm run dev`, migrate DB if needed, open the app.
2. **Connect X** (mock or real OAuth depending on config); confirm Connected Accounts UI.
3. **Schedule** a post (future `scheduledAt`), optional: include `[fail]` in caption text to force a mock `PLATFORM_FAILURE` after publish runs.
4. **Trigger scheduler** (bypass + `POST` job URL, or `CRON_SECRET` + Bearer).
5. **Scheduled page:** failed / needs reconnect messages, **Retry** (retryable codes including scheduler uncaught failures as `UNKNOWN`), **Reconnect** when status or error codes require it.

## Prisma / Next env parity

Next loads `.env` then `.env.local`. `prisma.config.ts` does the same for `prisma migrate`, `prisma studio`, etc., so Studio and the app should see the same `DATABASE_URL` when files are aligned.

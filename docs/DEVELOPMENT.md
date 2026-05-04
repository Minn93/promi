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

## Real auth shell (Phase 11.1)

Promi now includes a minimal Auth.js shell for real-auth mode.

When `PROMI_INTERNAL_BETA_MODE=1` (default), internal beta behavior is unchanged:

- Single-owner identity fallback is used.
- Login is not required for internal-beta workflows.

When `PROMI_INTERNAL_BETA_MODE=0`, login is required for protected app pages and user APIs.

Required auth env in real-auth mode:

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` (or `NEXTAUTH_SECRET`) | Session/JWT signing secret for Auth.js. |
| `AUTH_USER_EMAIL` | Minimal credentials-provider login email (Phase 11.1 shell). |
| `AUTH_USER_PASSWORD` | Minimal credentials-provider login password (Phase 11.1 shell). |
| `AUTH_USER_ID` (optional) | Stable owner id to place in session; defaults to `AUTH_USER_EMAIL` when omitted. |

Sign-in endpoint:

- `/api/auth/signin` (Auth.js default page)

## Owner scoping rollout status (Phase 12)

Phase 12 uses an expand -> backfill -> code -> constrain rollout.

- Phase 12.1-A: `owner_id` columns exist on scheduled/history/attempt tables as **nullable**.
- Phase 12.1-B: run owner-id backfill before owner-scoped query changes.
- Phase 12.1-E: run owner-id validation before applying `NOT NULL` constraints.
- Phase 12.1-F: `owner_id` is now required (`NOT NULL`) on `scheduled_posts`, `post_history`, and `publish_attempts`.

Backfill command:

```bash
npm run backfill:owner-ids
```

What it does:

- Uses `PROMI_INTERNAL_BETA_OWNER_ID` as fallback owner id (defaults to `local-dev-user`).
- Backfills missing `scheduled_posts.owner_id`.
- Backfills missing `post_history.owner_id` and `publish_attempts.owner_id` from related `scheduled_posts.owner_id` when possible.
- Falls back to internal-beta owner id when relation copy is not possible.
- Prints pre/post counts and exits non-zero if any `owner_id` remains missing.

Run this after Phase 12.1-A schema expand and before owner-scoped reads/writes if any existing rows have null/empty `owner_id`.

Owner-id validation command:

```bash
npm run validate:owner-ids
```

What it does:

- Counts null/empty `owner_id` rows in `scheduled_posts`, `post_history`, and `publish_attempts`.
- Counts `post_history.owner_id` rows that do not match related `scheduled_posts.owner_id`.
- Counts `publish_attempts.owner_id` rows that do not match related `scheduled_posts.owner_id`.
- Prints count-only output and exits non-zero when any blocking null/empty/mismatch is found.

Run this before `NOT NULL` migration work and again after migration/deploy checks.

### Phase 12 owner_id NOT NULL rollout plan

1. Run `npm run backfill:owner-ids`.
2. Run `npm run validate:owner-ids` and confirm zero blocking issues.
3. Deploy owner-writing code paths (scheduler + publish + user-facing writes already owner-propagating).
4. Run `npm run validate:owner-ids` against production data.
5. Apply Phase 12.1-F `NOT NULL` migration.
6. Re-run `npm run validate:owner-ids` as post-migration verification.

### Phase 12 owner_id rollback considerations

- If `npm run validate:owner-ids` fails, do not apply the `NOT NULL` constraint migration.
- If the constraint migration fails, keep nullable schema, inspect failing rows, and rerun backfill/validate.
- Do not delete rows to satisfy validation or migration.

## Entitlement foundation status (Phase 13.1-A)

Phase 13.1-A is a schema expand only step for server-authoritative entitlement groundwork.

- Added entitlement/audit schema: `owner_entitlements`, `entitlement_audit_logs`.
- Added provider-ready schema placeholders: `billing_customers`, `billing_subscriptions`, `billing_webhook_events`.
- Added indexes/uniques for owner lookups, timeline queries, subscription status filtering, and webhook idempotency keys.
- No runtime entitlement resolver changes were made in this phase.
- Existing plan checks, internal beta behavior, and owner-scoped create/schedule/history flows remain unchanged.
- Mock billing legacy UI is **non-authoritative** and limited to developer localStorage playgrounds (never linked from production bundles).

## Entitlement resolver status (Phase 13.1-B)

Phase 13.1-B adds a read-only server entitlement resolver path.

- Server plan resolution now checks `owner_entitlements` first for the current `owner_id`.
- Active entitlement rows resolve to their `plan_tier`.
- Inactive/canceled/expired rows resolve to `free`.
- If no entitlement row exists (or entitlement lookup fails), resolver falls back to existing env/default logic:
  - `PROMI_DEFAULT_PLAN`
  - `NEXT_PUBLIC_PROMI_DEFAULT_PLAN`
  - `PROMI_DEV_PRO_OWNER_IDS`
- Client localStorage/mock billing state is not authoritative for server entitlements.
- Public paid launch remains NO-GO; this phase does not add provider checkout/subscriptions/webhooks.

## Server plan-limit enforcement (Phase 13.1-C)

- All server-side limit checks resolve the plan tier through `getPlanTierForOwner(ownerId)` (includes `owner_entitlements` first, then env fallback inside `src/lib/plans/server.ts`).
- `env` / default plan variables apply only as the documented fallback path, not as parallel entitlement logic.
- Client localStorage/mock billing remains UI-only and is not trusted for server authorization.

## Manual entitlement tooling (Phase 13.1-D)

Operational CLI only (no public HTTP mutations). Loads `.env` / `.env.local` like other maintenance scripts.

- **Inspect:**  
  `npm run entitlement:manage -- --action=status --ownerId=<owner>`
- **Audit log (read-only, newest events first):**  
  `npm run entitlement:audit -- --ownerId=<owner>` (`--limit=1`-`100`; default `20`)
- **Grant Pro (manual):**  
  `npm run entitlement:manage -- --action=grant --ownerId=<owner> --confirm`  
  Sets `plan_tier=pro`, `status=active`, `source=manual`. Optional: `--effectiveAt=<ISO>`, `--expiresAt=<ISO>`, `--updatedBy=<id>`, `--notes=<text>`, `--actorOwnerId=<id>` (or env `PROMI_ENTITLEMENT_ACTOR_OWNER_ID`).
- **Revoke (manual):**  
  `npm run entitlement:manage -- --action=revoke --ownerId=<owner> --confirm`  
  Sets `plan_tier=free`, `status=inactive`, `source=manual`, clears `expires_at`. Does not delete rows.
- Convenience (still pass `--ownerId`):  
  `npm run entitlement:grant -- --ownerId=<owner>` and `npm run entitlement:revoke -- --ownerId=<owner>` (both require `--confirm` in the CLI args).

Mutations append a row to `entitlement_audit_logs`. `--confirm` is required for grant/revoke.

## Pro access UI (Phase 13.1-E / 13.2.4)

- `/upgrade` surfaces closed/internal-beta Pro access: manual approval messaging, **server** plan resolution (`getPlanTierForOwner`), and an optional read-only snapshot of `owner_entitlements`.
- After a tester requests Pro (mailto when `PROMI_UPGRADE_REQUEST_EMAIL` is set, or pasted text with `ownerId`), an operator grants with `npm run entitlement:grant -- --ownerId=<owner> …`.
- **Phase 13.2.4**: when **`isStripeHostedCheckoutOfferedServer()`** is true (billing flags **on**, Stripe configured), `/upgrade` may show **Continue with Stripe Checkout** — it calls **`POST /api/billing/checkout-session`** with the session cookie and redirects to Stripe. **`owner_id` is never accepted from JSON** on that route.
- Returning to **`/upgrade?checkout=success`** does **not** grant Pro; only **verified webhooks** update mirrors and **`owner_entitlements`**.
- `/upgrade/checkout` and `/upgrade/success` **redirect to `/upgrade` when `NODE_ENV=production`**; locally they remain a legacy **localStorage** playground that does **not** change server entitlements and must **never** impersonate hosted Stripe Checkout.

## Manual entitlement smoke evidence (Phase 13.1-F)

- End-to-end entitlement confirmation and template: **`docs/PHASE13_1_F_ENTITLEMENT_SMOKE_EVIDENCE.md`**
- Read-only audit log tail (newest first, default 20 rows, max 100):

```bash
npm run entitlement:audit -- --ownerId=<owner>
```

Equivalent: `npm run entitlement:manage -- --action=audit --ownerId=<owner> [--limit=20]`

## Stripe billing webhooks (Phase 13.2.x)

`POST` **`/api/webhooks/billing/stripe`** — **no session**; Stripe **signature verification** on the raw body (`stripe.webhooks.constructEvent`). When **`PROMI_BILLING_ENABLED=1`**:

1. **Persist** **`billing_webhook_events`** (**SHA-256** `payload_hash`; unique Stripe `event.id`).
2. **Atomically mirror + entitlement sync + `processed_at`:** upsert **`billing_customers`** / **`billing_subscriptions`** when the mirror plan applies, then reconcile **`owner_entitlements`** (**`source=provider`**) unless a **manual lock** blocks (see **`docs/PHASE13_2_BILLING_PLAN.md`**). Append **`entitlement_audit_logs`** with **`action=provider_sync`** only when entitlement fields actually change (`notes` carries `event.type:event.id` — no raw payloads). Same `event.id` replay returns **`200`** `alreadyProcessed` / **`alreadyProcessedConcurrent`** — **no duplicate audits**.
3. Resolver recognizes Stripe grace **`past_due`** subscriptions as billable-active (still **Pro** tier) alongside existing active statuses (`src/lib/entitlements/server.ts`).

**Events:**

- **`customer.subscription.*`** (with resolved owner): mirror rows + entitlement sync above.
- **`checkout.session.completed`** (**`mode=subscription`**): trusted mirror + entitlement pipeline only when **`client_reference_id`** / **`metadata.owner_id`** align with **`subscription.metadata.owner_id`** (set by **`POST /api/billing/checkout-session`**); otherwise **`kind=none`** with a safe note — **never** infer owner from arbitrary sessions.
- Unsupported types: ingest + **`processed_at`**, **`ignored`**, **no entitlement mutation**.

Manual **grant** (`manual`/`active`|`manual`): blocks provider overwrite until expired/revoked. Manual **revoke** (`inactive`/`free`): **does not lock** — later Stripe **`active`** webhooks may restore **`provider`** Pro.

If processing fails before commit: **`500`**; **`processed_at` stays null** for Stripe retries. Logs omit secrets, payloads, and customer PII (only Stripe ids/types where needed).

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe SDK secret API key (**test** keys for rehearsal). Never commit. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_…`). Never commit or log. |
| `STRIPE_PRO_PRICE_ID` | Stripe Price id (`price_…`) used for **`mode=subscription`** Checkout line items (**Pro**). |
| `PROMI_BILLING_PROVIDER` | Set **`stripe`** for ingest + Checkout + webhook path alignment. |
| `PROMI_BILLING_ENABLED` | Defaults **OFF** (`false`). **ON** (`1`/true): webhook ingest writes + mirror + entitlement sync; Checkout API rejects when **OFF**. |
| `PROMI_APP_URL` | **Preferred** canonical public origin (**no trailing slash**) for Stripe **`success_url` / `cancel_url`**. Fallback order in code: `NEXT_PUBLIC_APP_URL`, then **`NEXTAUTH_URL`**. Wrong origin breaks redirects after Checkout. |
| `NEXT_PUBLIC_APP_URL` | Optional fallback for canonical origin when **`PROMI_APP_URL`** is unset (build-time convention). Not used for webhook trust. |
| `NEXT_PUBLIC_PROMI_BILLING_ENABLED` | **Optional UX-only** mirror of billing readiness — **never** authoritative; server routes rely on **`PROMI_BILLING_*`** + secrets. Omit unless you deliberately want marketing copy keyed to a public flag. |

**Hosted Checkout Session API**: **`POST /api/billing/checkout-session`** requires all of: **`PROMI_BILLING_ENABLED`**, **`PROMI_BILLING_PROVIDER=stripe`**, **`STRIPE_SECRET_KEY`**, **`STRIPE_PRO_PRICE_ID`**, and a resolved canonical app URL. Missing pieces → **`503`** `billing_misconfigured`; billing **OFF** or wrong provider → **`403`** `billing_disabled`; unauthenticated caller → **`401`**. Responses return **`{ url }`** only (redirect to Stripe Hosted Checkout — **no** card data in-app).

Local Stripe CLI rehearsal:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/billing/stripe
# `.env.local`: STRIPE_WEBHOOK_SECRET from CLI; STRIPE_SECRET_KEY=test key; PROMI_BILLING_ENABLED=1
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
# Optional (13.2.4+): signed into the app as the target owner, POST /api/billing/checkout-session (same-origin),
# complete Checkout in Stripe **test** mode, then confirm webhook rows + `owner_entitlements.source=provider`.
```

For **full Checkout → webhook** proof (Phase **13.2.5**), capture delivered events and DB state — **do not** treat `/upgrade?checkout=success` as evidence of Pro.

Verify behavior after grant/revoke: use **status** and exercise server limits (`POST /api/scheduled-posts`, OAuth connect limits) — they use `getPlanTierForOwner`, not mock billing UI.

Validation command:

```bash
npm run check:internal-beta
```

The check script fails fast on missing required variables for the current mode and reports optional feature gaps as warnings.

Preflight command (recommended before deploy):

```bash
npm run preflight:internal-beta
```

This runs config validation, owner-id integrity validation, and production build checks in one command:

- `npm run check:internal-beta`
- `npm run validate:owner-ids`
- `npm run build`

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

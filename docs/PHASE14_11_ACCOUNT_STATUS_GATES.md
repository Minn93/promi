# Phase 14.11 — Account status gates (email verified + disabled users)

**Status:** implemented. **Public launch remains NO-GO.**

## Policy

### Internal beta (`PROMI_INTERNAL_BETA_MODE=1`, default)

- No Prisma **`User`** lookup for gates; all checks are **skipped** so single-owner / env workflows behave as before.

### Product-ready / real-auth (not internal beta)

- **`User.id`** equals **`owner_id`** from session.
- **Disabled** or **missing** user: **`403`** with `account_unavailable` / `ACCOUNT_UNAVAILABLE` (no extra account details).
- **Unverified email** (`email_verified` null): **`403`** with `email_verification_required` / `EMAIL_VERIFICATION_REQUIRED` where documented below.

Invite accept and password reset set **`email_verified`** (Phases 14.8 / 14.9). Users created via **`auth:user create`** should have verification set by ops if they need closed-beta API access before completing a mail-backed flow.

### Session caveat (JWT)

- Auth.js JWTs are **not** revoked immediately when an account is disabled or email flags change. **High-risk HTTP handlers** re-read **`User`** on each request (and the scheduler re-reads on publish). Sessions may still appear “signed in” on low-risk reads until expiry or sign-out.

## Server helper

**`src/lib/auth/user-status.ts`**

- `getOwnerAccountGateSnapshot(ownerId)` — `{ exists, disabled, emailVerified }` or **`internal_beta`**.
- `checkOwnerAccountGates(ownerId, { requireVerifiedEmail })` — returns a gate failure or `null`.
- `accountGateNextResponse` / `accountGateApiError` — consistent JSON for route handlers.

## Routes enforced (this phase)

| Area | Route | Disabled / missing | Verified email |
|------|--------|--------------------|----------------|
| Cost | `POST /api/generate` | yes | yes |
| Storage | `POST /api/uploads/scheduled-image` | yes | yes |
| Billing | `POST /api/billing/checkout-session` (when billing enabled) | yes | yes |
| OAuth | `GET /api/oauth/[platform]/start` — **X** only when **`X_REAL_PUBLISHING=1`** | yes | yes for that case |
| Scheduling | `POST /api/scheduled-posts` | yes | yes |
| Scheduling | `GET /api/scheduled-posts` | yes | no |
| Scheduling | `GET /api/scheduled-posts/[id]` | yes | no |
| Scheduling | `PATCH /api/scheduled-posts/[id]` (cancel) | yes | yes |
| Scheduling | `PATCH /api/scheduled-posts/[id]/edit` | yes | yes |
| Scheduling | `POST /api/scheduled-posts/[id]/retry` | yes | yes |
| History | `GET /api/post-history` | yes | no |
| Connected accounts | `GET /api/connected-accounts` | yes | no |
| Connected accounts | `PATCH /api/connected-accounts` (disconnect) | yes | no |
| Publish pipeline | `publishPost()` in scheduler — non–internal-beta | yes early | **X** + **`X_REAL_PUBLISHING=1`** + non-mock account only |
| OAuth | `GET /api/oauth/[platform]/callback` | yes | yes for **X** when **`X_REAL_PUBLISHING=1`** |
| Operations | `/ops` page (global aggregate) | yes (404 deny) | no |

## Deferred (documented)

| Area | Reason |
|------|--------|
| `/api/debug/current-owner` | Dev-only diagnostic endpoint (`NODE_ENV !== "production"`); intentionally exempt from account gates |
| Non-X real publish | No dedicated “real publish” env gate yet beyond X; Instagram/Facebook paths unchanged |
| Stripe webhook, scheduler **authorization** | Unchanged (secret / CRON) |

## Related docs

- `docs/DEVELOPMENT.md` — operator notes.
- `docs/INTERNAL_BETA_CHECKLIST.md` — rollout item.
- `docs/PHASE14_10_RATE_LIMITS.md` — rate limits (complementary).
- `docs/PHASE14_ROUTE_PROTECTION_MATRIX.md` — route table.

## Disabled-session invalidation (Phase 14.14 recommendation)

- **Closed beta recommendation:** keep **route-level DB account rechecks** on sensitive handlers/pages (current model), and continue expanding coverage when new owner-sensitive routes are introduced.
- **Not selected now:** shorter JWT maxAge alone (faster decay but no immediate revocation), token/session version fields (schema + callback complexity), or DB-backed sessions (broader auth migration).

## Compact manual smoke checklist (14.14)

- Disabled logged-in user is blocked from owner read APIs (`/api/scheduled-posts`, `/api/scheduled-posts/[id]`, `/api/post-history`, `/api/connected-accounts`).
- Disabled logged-in user is blocked from sensitive mutation/cost APIs (`/api/generate`, `/api/uploads/scheduled-image`, scheduled edit/retry/cancel/create, billing checkout-session, connected-account disconnect).
- Re-enabled user regains expected access on next request without re-login flow changes.
- Internal beta behavior remains unchanged (`PROMI_INTERNAL_BETA_MODE=1` bypass preserved).

# Phase 14.6 — Route protection matrix (`proxy.ts`)

**Status:** Implemented — **`proxy.ts`** aligns matcher coverage with owner-scoped pages and cost-bearing APIs. **Public launch remains NO-GO.**

**Internal beta perimeter:** When **`PROMI_INTERNAL_BETA_MODE=1`**, **`proxy.ts` bypasses all JWT checks** (same as before). Identity uses **`PROMI_INTERNAL_BETA_OWNER_ID`** via **`getCurrentOwnerId()`**; do not assume the edge guard enforces login in that mode.

---

## Legend

| Layer | Meaning |
|-------|--------|
| **Proxy** | **`proxy.ts`** requires a non-empty JWT **`sub`** when not in internal beta and path matches `config.matcher`. |
| **Handler** | Route uses **`getCurrentOwnerId()`** / **`resolveCurrentOwnerId()`** (or equivalent) for owner resolution and **401/403** semantics. |
| **Public** | No JWT required at proxy; handler may still validate signatures, secrets, or Auth.js callbacks. |

Proxy is **defense in depth** only — handlers stay the source of truth.

---

## Pages

| Route | Proxy (real-auth) | Handler / notes |
|-------|-------------------|-----------------|
| `/` | JWT required | Owner-scoped shell |
| `/create` | JWT required | Owner-scoped |
| `/scheduled` | JWT required | Owner-scoped |
| `/scheduled/[id]/edit` | JWT required | Under `/scheduled/` |
| `/history` | JWT required | Owner-scoped |
| `/analytics` | JWT required | Owner-scoped |
| `/settings` | JWT required | Owner-scoped |
| `/settings/accounts` | JWT required | Under `/settings/` |
| `/upgrade` | JWT required | Owner-scoped |
| `/upgrade/checkout` | JWT required | Under `/upgrade/`; prod redirects per upgrade pages |
| `/upgrade/success` | JWT required | Under `/upgrade/`; prod redirects per upgrade pages |
| `/products` | JWT required | Owner-scoped |
| `/drafts` | JWT required | Owner-scoped |
| `/performance` | JWT required | Owner-scoped |
| `/ops` | JWT required + **operator allowlist** in page | **Global aggregate** — not tenant-scoped; see § Operations |
| `/forgot-password` | **Public** (not in matcher) | Password reset request form (**Phase 14.8**) |
| `/reset-password` | **Public** (not in matcher) | Password reset consume form; **`?token=`** (**Phase 14.8**) |
| `/accept-invite` | **Public** (not in matcher) | Invite onboarding; **`?token=`** (**Phase 14.9**) |

---

## APIs

| Route | Proxy (real-auth) | Handler / notes |
|-------|-------------------|-----------------|
| `POST /api/generate` | JWT required | **`getCurrentOwnerId()`** before OpenAI (**14.1**); per-owner rate limit (**14.10**); account **disabled** / **`email_verified`** (**14.11**) |
| `POST /api/uploads/scheduled-image` | JWT required | **`getCurrentOwnerId()`** before write (**14.1**); per-owner rate limit (**14.10**); account gates (**14.11**) |
| `/api/scheduled-posts/*` | JWT required | Owner-scoped; **POST/cancel/edit/retry** enforce **14.11** disabled+verified policy; **GET list/detail** enforce disabled/missing account gate |
| `/api/post-history` | JWT required | Owner-scoped; **GET** enforces disabled/missing account gate |
| `/api/connected-accounts` | JWT required | Owner-scoped; **GET/PATCH(disconnect)** enforce disabled/missing account gate |
| `GET /api/oauth/[platform]/start` | JWT required | Redirect; **14.11**: **X** + **`X_REAL_PUBLISHING=1`** requires verified email |
| `GET /api/oauth/[platform]/callback` | JWT required | User should return with same session cookie; **14.11** callback parity: disabled/missing blocked, and **X** + **`X_REAL_PUBLISHING=1`** requires verified email |
| `POST /api/billing/checkout-session` | JWT required | **`getCurrentOwnerId()`**; billing flags; **14.11** when checkout offered |
| `POST /api/webhooks/billing/stripe` | **Not matched** — public at edge | **Stripe signature** only; no session |
| `GET/POST /api/jobs/process-due-scheduled-posts` | **Not matched** — public at edge | **`CRON_SECRET`** (or documented dev bypass) in handler |
| `/api/auth/*` | **Not matched** — public at edge | Auth.js sign-in/callback |
| `POST /api/auth/forgot-password` | **Not matched** — public at edge | Enumeration-safe outcome; **429** when rate limited (**14.10**); else generic **200** (**14.8**) |
| `POST /api/auth/reset-password` | **Not matched** — public at edge | Consumes **`password_reset`** token (**14.8**); **429** / **503** when rate limited / store missing (**14.10**) |
| `POST /api/auth/accept-invite` | **Not matched** — public at edge | First-time password (**14.9**); **429** / **503** when rate limited / store missing (**14.10**) |

---

## Operations (`/ops`)

- **Risk:** Dashboard aggregates **all tenants** (distinct owners, global counts, cross-owner failure samples). Treat as **trusted-operator-only** data.
- **Controls:** **`app/ops/page.tsx`** — **`PROMI_ENABLE_OPS_DASHBOARD=1`** OR **`PROMI_OPS_OWNER_IDS`** (comma-separated **`owner_id`** list) must include the signed-in user. **`PROMI_ENABLE_OPS_DASHBOARD`** is a deliberate “open to listed deploy only” escape hatch.
- **Account status:** In real-auth mode, `/ops` also applies disabled/missing account gates before showing aggregates (deny as not found).
- **Real-auth local dev:** Open-to-all-signed-in-users is **removed**: non-internal-beta dev/staging requires the same allowlist as production unless **`PROMI_ENABLE_OPS_DASHBOARD=1`**. **Internal beta** (`PROMI_INTERNAL_BETA_MODE=1`) + non-production still allows access for local single-tenant ergonomics.
- **Deferred:** Per-tenant ops, audit streams, and finer RBAC (**future phase**).

---

## Exceptions (explicitly not in `proxy` matcher)

- **`/_next/*`**, **`/favicon.ico`**, static assets — Next defaults / not listed.
- **`/api/auth/*`** — must remain callable without prior session for sign-in.
- **`/api/webhooks/billing/stripe`** — raw body + Stripe signature.
- **`/api/jobs/process-due-scheduled-posts`** — **`Authorization: Bearer CRON_SECRET`**.

---

## Related

- **`docs/PHASE14_SECURITY_SWEEP.md`** — generate/upload handler gates.
- **`docs/PHASE14_3_AUTH_MVP_SPEC.md`** — auth MVP and deferred matcher work (historical).
- **`docs/PHASE14_4_AUTH_USER_MODEL.md`** — Credentials + **`PROMI_AUTH_PRODUCT_READY`**.
- **`docs/PHASE14_8_PASSWORD_RESET.md`** — forgot / reset HTTP (Phase **14.8**).
- **`docs/PHASE14_9_INVITE_FLOW.md`** — invite HTTP (Phase **14.9**).

- **`docs/PHASE14_10_RATE_LIMITS.md`** — auth + cost API rate limits (Phase **14.10**).
- **`docs/PHASE14_11_ACCOUNT_STATUS_GATES.md`** — **`disabled`** + **`email_verified`** on high-risk handlers (Phase **14.11**).

---

## Recommended next phase

- **Phase 14.14+:** optional dedicated **`email_verify`** token flow; keep route-level disabled/missing gate coverage current for new owner-sensitive handlers/pages; ops hardening backlog below.
- **Ops hardening backlog:** tenant-scoped metrics, stricter production defaults for **`PROMI_ENABLE_OPS_DASHBOARD`**, structured audit logging.

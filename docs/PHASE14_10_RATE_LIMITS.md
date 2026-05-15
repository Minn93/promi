# Phase 14.10 — Server-side rate limits (auth + cost APIs)

**Status:** implemented. **Public launch remains NO-GO** until a **shared rate-limit store** (Upstash Redis) is configured in every **product-ready production** environment, limits are tuned under load, and manual 429/503 checks are recorded.

See also **`docs/PHASE14_11_ACCOUNT_STATUS_GATES.md`** (disabled user + **`email_verified`** on high-risk APIs).

## Goals

- Throttle **auth-sensitive** HTTP endpoints: forgot-password, reset-password, accept-invite, Credentials sign-in.
- Throttle **cost / storage** routes after owner resolution: `POST /api/generate`, `POST /api/uploads/scheduled-image`.
- **No** enumeration leaks: generic **429** / **503** bodies; no logging of passwords, tokens, or rate-limit key material beyond normal access logs.

## Store

Implementation: `src/lib/rate-limit/server.ts`.

- **Production, not internal beta** (`NODE_ENV=production` and `PROMI_INTERNAL_BETA_MODE=0`): **requires** Upstash REST Redis:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- Uses **`@upstash/ratelimit`** sliding window per namespace.
- **Internal beta** (`PROMI_INTERNAL_BETA_MODE=1`, default): rate limits are **disabled** (no Redis needed for perimeter).
- **Local / non-production** without Redis: **in-memory** fixed-window fallback (**dev-only**; not valid for multi-instance or production).

`npm run check:internal-beta` enforces Upstash when **`NODE_ENV=production`**, **`PROMI_INTERNAL_BETA_MODE=0`**, and **`PROMI_AUTH_PRODUCT_READY=1`**.

## Policies (initial numbers)

| Surface | Key | Limit |
|---------|-----|--------|
| `POST /api/auth/forgot-password` | HMAC(email) + IP | **5 / hour** |
| `POST /api/auth/reset-password` | IP | **10 / hour** |
| `POST /api/auth/accept-invite` | IP | **10 / hour** |
| Credentials `authorize` (sign-in) | HMAC(email) + IP | **10 / 15 minutes** |
| `POST /api/generate` | `ownerId` | **30 / hour** |
| `POST /api/uploads/scheduled-image` | `ownerId` | **20 / hour** |

Email hashing uses **`AUTH_SECRET` / `NEXTAUTH_SECRET`** as the HMAC key when set; local dev falls back to a **non-secret pepper** (still avoids storing raw email in Redis keys).

## HTTP behavior

- **429** — `{"error":"too_many_requests","message":"Too many requests. Please try again later."}` (or upload route equivalent via `apiError` `TOO_MANY_REQUESTS`).
- **503** (`store_required`) — `{"error":"service_unavailable","message":"Service temporarily unavailable. Please try again later."}` when **strict production** requires Redis and it is **missing**. Auth routes and cost APIs **fail closed** except sign-in (see below).

## Sign-in (NextAuth)

NextAuth **Credentials** `authorize` cannot return HTTP **429**. If login is **over** the sliding limit, credentials are rejected (**same as invalid password**).

If Redis is **missing** in strict production, login is **fail-open** with a **one-time** `console.warn` (documented here): sign-in is **not** limited until Upstash is configured. All other protected API routes above **fail closed (503)** when the store is missing.

## Manual validation

1. Forgot-password: repeat `POST /api/auth/forgot-password` with the same email → eventually **429** (not internal beta; with Redis or local in-memory).
2. Reset / accept-invite: repeat with dummy token → **429** after limit (still generic where applicable).
3. Generate / upload: repeat as an authenticated user → **429** per owner (product-ready / local dev with memory).
4. Internal beta: confirm **`PROMI_INTERNAL_BETA_MODE=1`** → limits **do not** apply.

## Related docs

- `docs/DEVELOPMENT.md` — env table.
- `docs/INTERNAL_BETA_CHECKLIST.md` — rollout item.
- `docs/PHASE14_9_INVITE_FLOW.md` — invite API (rate-limited in 14.10).

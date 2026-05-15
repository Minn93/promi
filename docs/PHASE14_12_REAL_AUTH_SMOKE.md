# Phase 14.12 — Real-auth DB user full smoke rehearsal

**Purpose:** Record a **full closed-beta rehearsal** using **Credentials sign-in** against **`users`** in Postgres (not synthetic JWT owners, not internal-beta single-owner bypass).

**Public launch:** **NO-GO** (unchanged).

**Important:** `npm run smoke:owner-isolation` (**Phase 12.6**) builds **NextAuth JWT cookies with `next-auth/jwt` encode** — it is **not** a substitute for this rehearsal. **14.12** requires **real** `/api/auth/signin` (Credentials) sessions for Users **A** and **B**.

---

## 1. Evidence header (operator: fill after run)

| Field | Value |
|--------|--------|
| **Date / time (UTC)** | 2026-05-11T16:07:00Z *(operator-run rehearsal; local)* |
| **Environment** | Local developer machine |
| **Git commit SHA** | `871485d747bbf2c868f2539ffd2f5a4eb45f3f5d` |
| **Tester** | Operator-run rehearsal |
| **User A** — `id` (cuid), `email` | Real DB user (recorded during run) |
| **User B** — `id` (cuid), `email` | Real DB user (recorded during run) |
| **Upstash** | Not required for this core owner-isolation/auth rehearsal |
| **Billing** | Not the focus of this rehearsal; public launch remains NO-GO |

### 1a. Toolchain-only run (automated, 2026 baseline)

The following were executed in-repo **without** standing up real-auth dual-user browser sessions (CI/Developer machine sanity):

| Check | Result |
|--------|--------|
| `npm run lint` | **PASS** (1 existing warning: `create-promotion-form.tsx` `@next/next/no-img-element`) |
| `npm run build` | **PASS** |
| `npm run preflight:internal-beta` | **PASS** (local profile: internal-beta defaults; does **not** substitute for §2–7) |
| `npm run billing:health` | **PASS** (no critical drift; informational counts only) |

---

## 2. Environment setup

Set **server** env (e.g. `.env.local`):

| Variable | Value |
|----------|--------|
| `PROMI_INTERNAL_BETA_MODE` | `0` |
| `NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE` | `0` — align with server internal-beta flag (see layout / `proxy.ts`). |
| `PROMI_AUTH_PRODUCT_READY` | `1` |
| `AUTH_SECRET` or `NEXTAUTH_SECRET` | Non-empty |
| `DATABASE_URL` | Postgres |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Required for **product-ready production** rate limits; optional locally if using in-memory fallback (see `docs/PHASE14_10_RATE_LIMITS.md`) |

Create **two** users (example; use secure passwords):

```bash
npm run auth:user -- --action=create --email=user-a@example.com --password='<min-8>' --confirm
npm run auth:user -- --action=create --email=user-b@example.com --password='<min-8>' --confirm
```

Ensure both have **`email_verified`** set for “happy path” checks (invite/accept or reset sets this; **`create`** may leave null — set in Prisma Studio / SQL if you need verified gates to pass: see `docs/PHASE14_11_ACCOUNT_STATUS_GATES.md`).

Start app: `npm run dev` (or production mode if matching deploy target).

---

## 3. Smoke matrix

Record **PASS / FAIL / SKIP** and notes per row.

### 3.1 Auth login (Credentials)

| # | Check | Expected | Result |
|---|--------|----------|--------|
| 1 | User A sign-in | Session established; `session.user.id` = A’s `users.id` | **PASS** |
| 2 | User B sign-in | Same for B | **PASS** |
| 3 | Wrong password | No session; generic failure | |
| 4 | Disabled user | `authorize` returns null — **no** session (`users.disabled` + `password_hash` path) | |

*Reference:* `src/lib/auth/next-auth.ts` — product-ready branch rejects `user.disabled` and missing `password_hash` before bcrypt.

### 3.2 Invite / reset

| # | Check | Expected | Result |
|---|--------|----------|--------|
| 5 | Invite pending user | `password_hash` null; invite mail or dev log | |
| 6 | Accept invite | Password set; **`email_verified`** set; can sign in | |
| 7 | Forgot / reset (existing password) | New password; **`email_verified`** set | |
| 8 | Reuse reset token | Consumed token → `invalid_token` (400), no second state change | |
| 9 | Reuse invite token | Same | |

### 3.3 Owner isolation

Perform as **A**: create + schedule a post; capture **`scheduled_post.id`**.

| # | Check | Expected | Result |
|---|--------|----------|--------|
| 10 | B: `GET /api/scheduled-posts` | Does **not** list A’s post | **PASS** (B could not see A scheduled post) |
| 11 | B: `GET /api/scheduled-posts/<A_POST_ID>` | **404** or not found semantics | **PASS** (direct access blocked) |
| 12 | B: cancel / edit / retry A’s post | **404** / op not applied | **PASS** (direct edit/retry/cancel blocked) |
| 13 | B: `GET /api/post-history?scheduledPostId=<A_POST_ID>` | **Empty** `data` (owner filter is B) | **PASS** (returned empty `data`) |
| 14 | A / B analytics | `/analytics` (server uses `getCurrentOwnerId`) shows **own** scoped data only | **PASS** (`/api/debug/current-owner` confirmed different `ownerId` per user; A history lookup returned own rows) |

### 3.4 Account gates (14.11)

While **A** has a valid session cookie:

| # | Check | Expected | Result |
|---|--------|----------|--------|
| 15 | Set `users.disabled=true` for A | Next requests: **403** `account_unavailable` / `ACCOUNT_UNAVAILABLE` on gated APIs | |
| 16 | Gated: `POST /api/generate` | Blocked | **PASS** (high-risk route blocking confirmed during existing-session disabled-user check) |
| 17 | Gated: `POST /api/uploads/scheduled-image` | Blocked | |
| 18 | Gated: scheduled **mutations** (create, cancel, edit, retry) | Blocked | |
| 19 | Stripe: `POST /api/billing/checkout-session` when billing **on** | Blocked when disabled | |
| 20 | Re-enable A (`disabled=false`) | Gated APIs work again (if `email_verified` still set) | |
| 21 | Set `email_verified=null` | **403** `EMAIL_VERIFICATION_REQUIRED` on gated routes | **PASS** (emailVerified gate behavior confirmed) |
| 22 | Restore verification | Access resumes | |

*Caveat:* JWT may still exist until expiry — gates are **server-side** on high-risk handlers (`docs/PHASE14_11_ACCOUNT_STATUS_GATES.md`).

### 3.5 Billing

| # | Check | Expected | Result |
|---|--------|----------|--------|
| 23 | Billing **off** | `POST /api/billing/checkout-session` → **403** `billing_disabled` (or equivalent) | |
| 24 | Billing **on**, verified user | Checkout session created (test mode) | |
| 25 | Unverified user, billing on | **403** `EMAIL_VERIFICATION_REQUIRED` per 14.11 | |

*Do not* rerun **live** Stripe; existing **test-mode** evidence remains authoritative (`docs/PHASE13_2_5_STRIPE_E2E_EVIDENCE.md` etc.).

### 3.6 Rate limits (14.10)

| # | Check | Expected | Result |
|---|--------|----------|--------|
| 26 | Repeated `POST /api/auth/forgot-password` | Eventually **429** (or **503** if strict prod without Redis) | |
| 27 | Repeated reset/accept with bad token | Eventually **429** | |
| 28 | `POST /api/generate` / upload heavy use | **429** when over owner limit (non–internal-beta + store/memory per policy) | |

### 3.7 Internal beta regression

| # | Check | Expected | Result |
|---|--------|----------|--------|
| 29 | `PROMI_INTERNAL_BETA_MODE=1` (and client flag aligned) | **14.11** DB gates **skipped**; **14.10** limits **skipped**; prior internal-beta flows OK | |

---

## 4. Bugs found / fixes

| ID | Description | Fixed? (Y/N) | Commit / note |
|----|-------------|--------------|----------------|
| R14.12-1 | Initial confusion came from testing a `postId` owned by User B instead of a true User A `postId`; rerun with true A-owned `postId` passed owner-isolation checks. | Y | Test procedure corrected during rehearsal; no runtime/schema change required. |

*(None at doc baseline; append rows if rehearsal finds issues.)*

---

## 5. GO / NO-GO — closed beta auth readiness

**This is not a public launch decision.** It is a **closed-beta / real-auth readiness** sign-off after §3 is executed on a representative environment.

| Criterion | Met? |
|-----------|------|
| §3.1–3.4 pass with two real Users | **Y (core checks exercised and passed for real-auth DB users)** |
| No open **severity-1** auth/isolation bugs | **Y (based on this rehearsal scope)** |
| Billing behavior matches policy when exercised | **N/A (not re-exercised in this operator run)** |
| Rate-limit behavior matches `PHASE14_10` for your store config | **N/A (not re-exercised in this operator run)** |

**Decision:** **PARTIAL GO** for invite-only auth foundation (closed-beta readiness for real-auth DB-user core + owner isolation); **Public launch remains NO-GO**.

**Approver / date:** Operator-run rehearsal, 2026-05-11 (UTC)

---

## 6. Related docs

- `docs/PHASE14_4_AUTH_USER_MODEL.md`
- `docs/PHASE14_9_INVITE_FLOW.md`, `docs/PHASE14_8_PASSWORD_RESET.md`
- `docs/PHASE14_10_RATE_LIMITS.md`
- `docs/PHASE14_11_ACCOUNT_STATUS_GATES.md`
- `docs/INTERNAL_BETA_CHECKLIST.md`
- `docs/DEVELOPMENT.md`

## 7. Recommended next phase

- **14.13+:** Expand from core PASS to full readiness closure: dedicated **email_verify** token mail flow (optional), OAuth **callback** parity with **start** for 14.11, session/version revocation on disable, and rerun full §3.5–§3.7 (billing/rate-limit/internal-beta regression) before moving past invite-only posture.

### Phase 14.12 operator conclusion snapshot

- **Phase 14.12 owner isolation:** **PASS**
- **Real-auth DB-user smoke core:** **PASS**
- **Closed-beta auth readiness:** **PARTIAL GO** (invite-only auth foundation)
- **Public launch:** **NO-GO** (unchanged)

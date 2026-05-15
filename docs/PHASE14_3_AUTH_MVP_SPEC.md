# Phase 14.3 — Auth MVP spec + readiness flags (planning only)

**Status:** Specification and flag design **before** implementation. **Phase 14.4** implements DB **`User`**, **`PROMI_AUTH_PRODUCT_READY`**, and layout gating — see **`docs/PHASE14_4_AUTH_USER_MODEL.md`**.

**Context:** Today Promi uses Auth.js **Credentials** against **`AUTH_USER_*` env** (single logical user), JWT sessions, and **`resolveCurrentOwnerId()`** mapping **internal beta → `PROMI_INTERNAL_BETA_OWNER_ID`** else **`session.user.id`**. Production with **`PROMI_INTERNAL_BETA_MODE=0`** renders a **global block** in **`app/layout.tsx`** (“public launch blocked”). **Public launch remains NO-GO** until auth MVP, isolation evidence, rate limits, legal posture, and billing readiness are satisfied independently.

---

## 1) Recommended auth direction

### Primary recommendation: **Auth.js + Prisma `User` (invite-only MVP)**

**Use NextAuth/Auth.js with a database-backed `User` model** (email + password hash or magic-link flow), **Credentials** (or **Email** provider later) against **Prisma**, stable **`User.id`** as **`owner_id`**.

**Reasoning (fits solo founder + current stack):**

- Auth.js is **already integrated** (`src/lib/auth/next-auth.ts`, `proxy.ts`, `session.ts`); extending **`authorize()`** to Prisma is a **small conceptual jump** vs introducing a second session system.
- **No new vendor subscription** for identity at small scale; cost is email (Resend/Postmark) + your time to implement reset/invite tokens safely.
- **`owner_id`** already aligns with **`session.user.id`** — **`User.id`** (cuid/uuid) maps 1:1 with existing **`owner_entitlements`**, **`scheduled_posts`**, etc.
- Avoids **dual identity sources** in production (Clerk JWT + Auth.js) unless there is a hard deadline that justifies that complexity.

### Alternative: **Clerk (managed auth)**

Choose **Clerk** if **time-to-market dominates** and recurring cost is acceptable: faster UI, hosted reset/verification, less crypto/email foot-gun risk. **Map `ownerId` to Clerk `userId`** (stable string from Clerk) everywhere Promi uses **`owner_id`**.

### Not recommended for MVP: **Staged “Clerk first + keep env Auth.js for internal”**

Running **Clerk in prod** and **env Credentials in dev** is workable, but **two mental models** for `getCurrentOwnerId()` and session shape increase bug risk. Prefer **one** production identity path; internal beta **already** bypasses login via **`PROMI_INTERNAL_BETA_MODE=1`**.

**Decision record (fill at kickoff):** `[ ] Auth.js + Prisma User` · `[ ] Clerk` — date / approver.

---

## 2) `ownerId` mapping

| Path | `ownerId` source | Notes |
|------|------------------|--------|
| **Internal beta** (`PROMI_INTERNAL_BETA_MODE=1`) | **`PROMI_INTERNAL_BETA_OWNER_ID`** (default `local-dev-user`) | Unchanged; no session required. |
| **Auth.js + Prisma** | **`User.id`** (primary key from DB) | Set JWT **`sub`** and **`session.user.id`** to this value; **never** use email as `owner_id` in new users (legacy may exist — see migration). |
| **Clerk** | **Clerk `userId`** | Same rules: stable opaque string; store in session; use as **`owner_id`** across app. |

**Billing / Stripe:** Continue **server-only** `owner_id` on Checkout metadata and webhooks — no body trust.

---

## 3) Internal beta coexistence

- **`PROMI_INTERNAL_BETA_MODE=1`**: **Existing behavior preserved** — **`resolveCurrentOwnerId()`** returns internal beta owner; **`proxy.ts`** skips JWT enforcement; single-tenant rehearsal unchanged.
- **Real multi-user auth in production** is **not** enabled by flipping internal beta alone. It requires:
  1. Auth MVP implementation (Phase 14.4+),
  2. **`PROMI_INTERNAL_BETA_MODE=0`** on the target deploy,
  3. **`PROMI_AUTH_PRODUCT_READY=1`** (see §4) so **`app/layout.tsx`** does not show the static block page.

**Scheduler and Stripe webhooks:** **Unchanged** — **`CRON_SECRET`** and **`STRIPE_WEBHOOK_SECRET`** remain the only auth for those surfaces; do not route them through user session.

---

## 4) Readiness flags and `app/layout.tsx` interaction

### Proposed env flags

| Flag | Purpose |
|------|--------|
| **`PROMI_AUTH_PRODUCT_READY`** | **Auth MVP is deployed and signed off** for this environment: multi-user login, invite path, password or magic link, session security baseline, and layout may render the real app when not in internal beta. |
| **`PROMI_PUBLIC_APP_READY`** (optional, later) | **Broader “open to strangers” gate**: rate limits, legal links, support path, abuse posture documented — **not** required to unblock **closed** beta with invite-only users. Default **unset/false** until Phase 15+ style work. |

### Layout rule (spec — implement in 14.4+)

**Today (documented behavior):**  
`blockedPublicLaunch = (NODE_ENV === "production") && !isInternalBetaModeServer()` → full-app block.

**Target behavior:**

1. If **`PROMI_INTERNAL_BETA_MODE=1`**: render app (internal beta) — **unchanged**.
2. Else if **production** and **`PROMI_AUTH_PRODUCT_READY` is not truthy**: **keep block** (or a stricter “misconfiguration” page) — **never** show owner-scoped UI without auth MVP.
3. Else if **production** and **`PROMI_AUTH_PRODUCT_READY=1`**: render app; **JWT / session** enforced by **`proxy.ts`** and per-route checks.

**`PROMI_PUBLIC_APP_READY`:** Use only when opening **public** signup or marketing “open beta”; can remain **off** for **invite-only closed beta** with **`PROMI_AUTH_PRODUCT_READY=1`**.

**Safety:** Treat **`PROMI_AUTH_PRODUCT_READY=1` + `PROMI_INTERNAL_BETA_MODE=0`** as a **high-privilege** production configuration — require checklist sign-off.

---

## 5) Route protection expectations

| Class | Expectation |
|-------|--------------|
| **Owner-scoped pages** (`/`, `/create`, `/scheduled`, `/history`, `/analytics`, `/settings`, `/upgrade`, `/scheduled/[id]/edit`, etc.) | Enforced **`getCurrentOwnerId()`** (server) + **`proxy.ts`** JWT where listed; **align matcher** in a later phase so **`/upgrade`**, **`/products`**, **`/drafts`**, **`/performance`** match product policy — spec: **defense in depth** (middleware + route). |
| **Owner-scoped APIs** (`/api/scheduled-posts`, `/api/post-history`, `/api/connected-accounts`, `/api/oauth/*`, etc.) | **`getCurrentOwnerId()`**; **`401`** on failure — already pattern on several routes; normalize after MVP. |
| **Cost-bearing** (`POST /api/generate`) | Auth before OpenAI (**Phase 14.1**); keep; add **rate limit** post-MVP. |
| **Upload** (`POST /api/uploads/scheduled-image`) | Auth before multipart (**Phase 14.1**); keep. |
| **Billing** (`POST /api/billing/checkout-session`) | **`getCurrentOwnerId()`** + billing flags (**unchanged**). |
| **Webhooks** (`POST /api/webhooks/billing/stripe`) | **Signature only**; no session — **exception**. |
| **Scheduler** (`POST /api/jobs/process-due-scheduled-posts`) | **`Bearer CRON_SECRET`** (or documented dev bypass) — **exception**. |
| **`/ops`** | Remains **operator allowlist** (`PROMI_OPS_OWNER_IDS` / **`PROMI_ENABLE_OPS_DASHBOARD`**); revisit **tenant scoping** of metrics before widening access (separate backlog). |

---

## 6) Closed beta signup model

| Element | MVP spec |
|---------|----------|
| **Signup** | **Invite-only** — no public **`/signup`** or self-serve registration at first. |
| **Account creation** | Operator or script creates **`User`** (or issues **signed invite token**); first visit sets password or completes magic link. |
| **Email verification** | **Defer** for smallest MVP if invite channel is trusted (e.g. known testers); **require before Stripe paid** per **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`** commerce posture. Document risk if deferred. |
| **Password reset** | **Required** before production closed beta with passwords: token + TTL + single-use + email; rate-limit request endpoint. |
| **Account recovery** | Same as reset for MVP; no separate “security questions.” |

---

## 7) Required schema / API changes (by chosen path)

### Auth.js + Prisma User (recommended)

| Item | Purpose |
|------|--------|
| **`User` table** | `id`, `email` (unique), `passwordHash` (nullable if magic-only), `emailVerified` (DateTime?), `createdAt`, `updatedAt` |
| **Optional: `VerificationToken` / `PasswordResetToken`** | Or generic token table with `type` enum — invite, verify, reset |
| **NextAuth Prisma Adapter tables** | **Only if** adopting DB sessions or OAuth later; **JWT-only MVP** can omit **`Session`** initially |
| **API routes (future impl)** | `POST /api/auth/invite/accept`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` — **minimal**, CSRF-safe patterns |
| **`authorize()`** | Lookup user by email, verify bcrypt/argon2; return `{ id: user.id, email }` |

### Clerk

| Item | Purpose |
|------|--------|
| **Clerk SDK + middleware** | Replace/augment **`proxy.ts`** per Clerk Next.js guide |
| **Promi DB** | Optional **`users` mirror** for reporting only — **or** trust Clerk id only as **`owner_id`** |
| **Webhooks** | Clerk user lifecycle (optional) if denormalizing |

**Billing / owner_entitlements:** No change to **semantics** — keys remain **`owner_id`** string.

---

## 8) Migration from env Credentials

1. **Internal beta:** Keep **`local-dev-user`** (or configured **`PROMI_INTERNAL_BETA_OWNER_ID`**) indefinitely for single-tenant deploys; **no migration** when `INTERNAL_BETA=1`.
2. **First real users:** Create **`User`** rows with **new** opaque ids; **`owner_entitlements` / `scheduled_posts` / `post_history`** use those ids for new data.
3. **Existing test data** tied to `local-dev-user`: remains valid under internal beta; for staging multi-user seeds, duplicate fixtures per **`User.id`** as needed.
4. **Env `AUTH_USER_*`:** Deprecated after MVP — remove from production **`PROMI_AUTH_PRODUCT_READY`** deploy configs; retain optional **single-user emergency** login only if explicitly approved (prefer not).
5. **If legacy email-as-owner_id existed:** One-time migration script → map to **`User.id`** (out of MVP scope unless discovered).

---

## 9) Rollout plan

| Stage | Actions |
|-------|---------|
| **Local** | Internal beta unchanged; branch for auth MVP behind feature work; run two-user flows with **`PROMI_INTERNAL_BETA_MODE=0`** locally. |
| **Staging** | **`PROMI_INTERNAL_BETA_MODE=0`**, **`PROMI_AUTH_PRODUCT_READY=1`**, real **`AUTH_SECRET`**, invite-only users; run isolation smoke + generate/upload/checkout checks. |
| **Production internal beta** | Prefer **keep `INTERNAL_BETA=1`** until staging sign-off; no user-visible auth change required. |
| **Production closed beta** | **`INTERNAL_BETA=0`**, **`AUTH_PRODUCT_READY=1`**, invite-only; monitor errors and auth logs; Stripe **test** mode only unless **13.2.9** live GO. |

---

## 10) Validation (exit criteria for Auth MVP GA within closed beta)

- [ ] **Two distinct users**: sign in as A and B on same deploy; verify **cookies/sessions do not collide**.
- [ ] **`npm run smoke:owner-isolation`** (real-auth paths) passes with **JWT** enforced.
- [ ] **`POST /api/generate`** and **`POST /api/uploads/scheduled-image`**: authenticated **PASS**; unauthenticated **401** (real-auth mode).
- [ ] **`POST /api/billing/checkout-session`**: only signed-in owner; **403/401** for anonymous.
- [ ] **`/ops`**: deny by default **non-listed** **`owner_id`**; allowlist tested.
- [ ] **Internal beta regression**: **`PROMI_INTERNAL_BETA_MODE=1`** full flow unchanged on a sample deploy.

---

## 11) What remains NO-GO for **public** beta (even after Auth MVP)

Auth MVP + **`PROMI_AUTH_PRODUCT_READY`** enable **invite-only closed beta**, not necessarily **public** beta.

**Still NO-GO for open public beta** until (non-exhaustive):

- **Public signup** policy + **abuse controls** (rate limits, captcha optional), **`PROMI_PUBLIC_APP_READY`** or equivalent sign-off
- **Legal**: privacy/terms surfacing, data retention clarity
- **`/ops`** and other **cross-tenant** surfaces reviewed
- **Stripe live** and paid launch per **Phase 13.2.9** + release management
- **X / platform** commercial readiness if promised in marketing

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Layout flag mis-set** | **`AUTH_PRODUCT_READY=1`** without working auth → users see broken app; use staging + checklist. |
| **JWT session theft** | Secure cookies, HTTPS, reasonable **`maxAge`**, later rotation/revocation story. |
| **Weak invite tokens** | Short TTL, single-use, constant-time compare. |
| **Dual-mode bugs** | Integration tests for **`INTERNAL_BETA=1`** and **`INTERNAL_BETA=0`**. |

---

## Recommended implementation phases (after this spec)

| Phase | Scope |
|-------|--------|
| **14.4** | Prisma `User` + bcrypt (or Clerk install) + `authorize()` + layout flag wiring (`PROMI_AUTH_PRODUCT_READY`) |
| **14.5** | Invite + reset emails + token tables; rate limits on auth endpoints (planning split: **14.7** foundation landed) |
| **14.6** | Middleware matcher alignment; **`/ops` scoping** backlog; documentation updates (`DEVELOPMENT.md`, checklist) |
| **14.7** | **`AuthOneTimeToken`** schema + helpers + **`sendMail`** (Resend); CLI issue-token — **`docs/PHASE14_7_AUTH_TOKENS_MAIL.md`** |
| **14.8** | **`POST` forgot-password / reset-password** + pages; prior **`password_reset`** tokens replaced on new request — **`docs/PHASE14_8_PASSWORD_RESET.md`** (rate limits TODO **14.10+**) |
| **14.9** | **Invite onboarding** (`accept-invite`, nullable `password_hash`, operator **`invite`**) — **`docs/PHASE14_9_INVITE_FLOW.md`** |

---

## Related docs

- **`docs/PHASE14_7_AUTH_TOKENS_MAIL.md`** — token + mail foundation
- **`docs/PHASE14_8_PASSWORD_RESET.md`** — implemented reset flow
- **`docs/PHASE14_9_INVITE_FLOW.md`** — implemented invite flow
- **`docs/PHASE14_SECURITY_SWEEP.md`** — generate/upload auth gates
- **`docs/DEVELOPMENT.md`** — internal beta + real-auth env
- **`docs/INTERNAL_BETA_CHECKLIST.md`**
- **`docs/PHASE13_2_9_LIVE_MODE_READINESS.md`** — paid launch gates (orthogonal to auth MVP)

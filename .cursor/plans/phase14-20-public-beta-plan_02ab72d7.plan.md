---
name: phase14-20-public-beta-plan
overview: Safest minimal path to enable a small public open beta with reversible signup, while preserving auth boundaries, free-tier limits, and operator-only surfaces.
todos:
  - id: add-signup-flag
    content: Add server flag helper for PROMI_PUBLIC_BETA_SIGNUP and document semantics
    status: pending
  - id: build-signup-route
    content: Implement POST /api/auth/signup with validation, rate limit, and safe user creation
    status: pending
  - id: add-signup-ui
    content: Create /signup page + form and wire CTA visibility on / and /login when flag enabled
    status: pending
  - id: keep-boundaries
    content: Verify proxy protection and /ops boundary remain unchanged
    status: pending
  - id: update-docs
    content: Update runbook/checklist/readiness docs with public beta signup operation and rollback
    status: pending
  - id: verify-and-smoke
    content: Run lint/build/preflight/billing-health and execute manual auth/signup protection smoke
    status: pending
isProject: false
---

# Phase 14.20 Public Beta Access Plan

## Recommendation Summary

Use a **flag-gated self-serve signup** path that is disabled by default and can be turned off instantly:

- New env flag: `PROMI_PUBLIC_BETA_SIGNUP` (`0` default, `1` enabled)
- New public routes: `/signup` (page) + `POST /api/auth/signup` (API)
- Keep existing invite flow fully intact (`/accept-invite`, operator `auth:user invite`)
- Keep billing posture unchanged (test/manual only; no live checkout implication)
- Keep `/ops` operator-only with existing allowlist/page gates

## 1) Recommended Route Structure

- Public pages:
  - `/` (landing)
  - `/login`
  - `/signup` (new; only active when `PROMI_PUBLIC_BETA_SIGNUP=1`)
  - `/accept-invite`
  - `/forgot-password`, `/reset-password`
- Public auth API:
  - `POST /api/auth/signup` (new)
- Protected app stays unchanged:
  - `/create`, `/scheduled`, `/history`, `/settings`, `/products`, `/drafts`, `/upgrade`, `/ops`, etc.

Proxy/middleware impact:

- Keep `/signup` out of protected prefixes/matcher
- Keep all existing protected routes protected as-is in [`proxy.ts`](C:/Users/조정민/promi/proxy.ts)

## 2) Files to Change (Minimal)

Core feature:

- Add signup flag helper in [`src/lib/internal-beta-mode.ts`](C:/Users/조정민/promi/src/lib/internal-beta-mode.ts)
  - `isPublicBetaSignupEnabledServer()` parsing `PROMI_PUBLIC_BETA_SIGNUP`
- Add signup API route: [`app/api/auth/signup/route.ts`](C:/Users/조정민/promi/app/api/auth/signup/route.ts)
- Add signup page (server): [`app/signup/page.tsx`](C:/Users/조정민/promi/app/signup/page.tsx)
- Add signup form component (client): [`components/signup-form.tsx`](C:/Users/조정민/promi/components/signup-form.tsx)
- Wire login page with optional signup link when flag is on: [`app/login/page.tsx`](C:/Users/조정민/promi/app/login/page.tsx)
- Update landing CTA behavior when flag is on: [`app/page.tsx`](C:/Users/조정민/promi/app/page.tsx)

Optional guard alignment:

- Ensure `proxy.ts` does not accidentally protect `/signup`: [`proxy.ts`](C:/Users/조정민/promi/proxy.ts)

Docs:

- Add env/docs + operator rollback steps in:
  - [`docs/INTERNAL_BETA_RUNBOOK.md`](C:/Users/조정민/promi/docs/INTERNAL_BETA_RUNBOOK.md)
  - [`docs/INTERNAL_BETA_CHECKLIST.md`](C:/Users/조정민/promi/docs/INTERNAL_BETA_CHECKLIST.md)
  - [`docs/PHASE14_15_CLOSED_BETA_READINESS.md`](C:/Users/조정민/promi/docs/PHASE14_15_CLOSED_BETA_READINESS.md) (status wording only)

## 3) Signup API Behavior (Safe Defaults)

`POST /api/auth/signup`:

- Input: `email`, `password` (min 8)
- Hard gate: if `PROMI_PUBLIC_BETA_SIGNUP!=1` return `404` or `403 signup_disabled`
- Normalize email (trim/lowercase)
- Reject if existing user row with same email already exists
- Hash password with existing bcrypt cost (`12`) and create `User` with:
  - `passwordHash` set
  - `disabled=false`
  - `emailVerified=null` (unchanged policy; existing gates already tolerate this on selected pages)
- Return generic safe payload, then client redirects to `/login` (or immediate sign-in + `/create` as optional follow-up)

Plan tier result:

- New users default to Free naturally through existing resolver in [`src/lib/plans/server.ts`](C:/Users/조정민/promi/src/lib/plans/server.ts) + entitlement fallback (no new entitlement row required)

## 4) Security Risks and Controls

Primary risks:

- Spam/fake account creation
- Credential stuffing/brute-force against auth endpoints
- Accidental public-opening beyond intended scope

Mitigations (minimal but required):

- Add rate limit bucket for signup in [`src/lib/rate-limit/server.ts`](C:/Users/조정민/promi/src/lib/rate-limit/server.ts), analogous to forgot/reset/auth login
  - Suggested: 5/hour per IP + email hash dimension
- Require Redis store in product-ready prod (already enforced for non-internal-beta APIs in current rate-limit logic)
- Do not expose whether account exists beyond clear but non-sensitive API semantics
- Keep `/ops` unchanged (allowlist + page gate)
- Keep billing env and copy unchanged: no live paid flow implication

Not included in minimal scope (can be phase 2):

- CAPTCHA / bot scoring
- Double opt-in email verification before first login

## 5) Abuse/Rate-Limit Additions Needed

In [`src/lib/rate-limit/server.ts`](C:/Users/조정민/promi/src/lib/rate-limit/server.ts):

- Add `signup` namespace in `RATE_LIMITS`
- Use `consumeRateLimit()` in `POST /api/auth/signup`
- Return standardized `429` via `rateLimitFailureResponse()`

In preflight policy:

- Keep current rule: product-ready prod without Redis should fail API rate-limit-dependent checks

## 6) Rollback Plan to Invite-Only

Immediate rollback (no DB migration rollback required):

1. Set `PROMI_PUBLIC_BETA_SIGNUP=0`
2. Redeploy
3. Verify `/signup` now disabled (403/404)
4. Keep existing users active; optionally disable abusive accounts via:
   - `npm run auth:user -- --action=disable --email=<email> --confirm`
5. Re-run:
   - `npm run preflight:internal-beta`
   - `npm run billing:health`

This preserves invited users and existing auth flows.

## 7) Exact Implementation Sequence

1. Add flag helper for `PROMI_PUBLIC_BETA_SIGNUP`
2. Implement `POST /api/auth/signup` with validation + rate limit + user create
3. Add `/signup` page + client form
4. Update `/login` and `/` CTA text/links to show “Start beta” only when flag enabled
5. Keep invite flow unchanged and co-existing
6. Add docs for operation + rollback
7. Run validation: lint/build/preflight/billing-health
8. Manual smoke:
   - signup disabled mode
   - signup enabled mode
   - login/reset/invite still working
   - protected routes + `/ops` boundary unchanged

## Architecture Snapshot

```mermaid
flowchart TD
  publicVisitor[PublicVisitor] --> landing[/]
  landing -->|Start beta if flag on| signupPage[/signup]
  landing -->|Request invite fallback| inviteInfo[InviteOnlyInfo]
  landing -->|Sign in| loginPage[/login]

  signupPage --> signupApi[POST_/api/auth/signup]
  signupApi --> signupFlag{PROMI_PUBLIC_BETA_SIGNUP}
  signupFlag -->|off| denied[403_or_404]
  signupFlag -->|on| signupRateLimit[RateLimit_signup]
  signupRateLimit --> createUser[CreateUser_free_default]
  createUser --> loginPage

  loginPage --> nextAuth[NextAuth_Credentials]
  nextAuth --> appRoutes[ProtectedAppRoutes]
  appRoutes --> opsRoute[/ops_allowlist_only]
```

## Acceptance Criteria

- Public signup works only when `PROMI_PUBLIC_BETA_SIGNUP=1`
- New self-serve users can sign in with credentials and land in workspace
- Plan resolves to Free by default
- Invite flow still works unchanged
- `/ops` remains operator-only
- Landing/login copy remains beta-safe (no public launch/live billing claims)
- Rollback to invite-only is a one-flag deploy

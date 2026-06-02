# Phase 14.20 — Public Beta Signup Smoke Checklist

Purpose: verify the self-serve signup gate can be enabled safely and rolled back to invite-only with one flag.

Scope: auth/signup only. No live billing implications.

---

## A) Disabled mode smoke (`PROMI_PUBLIC_BETA_SIGNUP=0`)

- [ ] `GET /signup` returns `404` (safe disabled response).
- [ ] `POST /api/auth/signup` returns `403` with `error=signup_disabled`.
- [ ] Landing page CTA remains invite-oriented (`Request invite`).
- [ ] Login page does not show self-serve signup link.
- [ ] Existing invite flow still works (`invite -> accept-invite -> login`).
- [ ] Existing forgot/reset-password flow still works.
- [ ] `/ops` remains operator-only for non-operators.

Expected decision: **PASS** keeps invite-only posture intact.

---

## B) Enabled mode smoke (`PROMI_PUBLIC_BETA_SIGNUP=1`)

- [ ] Landing page shows `Start public beta` CTA for logged-out visitors.
- [ ] `/signup` loads and allows email/password submission.
- [ ] Successful `POST /api/auth/signup` returns `200` and account can sign in at `/login`.
- [ ] Existing invite flow still works unchanged.
- [ ] Existing forgot/reset-password flow still works unchanged.
- [ ] `/ops` remains operator-only for non-operators.

### Free-plan safety checks

- [ ] Newly signed up user gets `owner_entitlements.plan_tier=free`.
- [ ] Newly signed up user entitlement source is `signup`.
- [ ] No Pro entitlement is created by self-serve signup.

### Rate-limit checks

- [ ] Repeated signup attempts for same email/IP hit `429 too_many_requests` after threshold.
- [ ] In product-ready production, missing Upstash store fails closed per shared rate-limit policy.

Expected decision: **PASS** means limited public-beta signup can remain enabled.

---

## C) Rollback smoke (one-flag deploy)

1. Set `PROMI_PUBLIC_BETA_SIGNUP=0`.
2. Redeploy.
3. Re-run section A checks.

Rollback PASS criteria:

- [ ] `/signup` is disabled (`404`).
- [ ] `POST /api/auth/signup` is disabled (`403`).
- [ ] Existing invited users can still sign in/reset-password.
- [ ] No change to `/ops` operator-only boundary.

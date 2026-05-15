# Phase 14.8 — Forgot password + reset password (HTTP)

**Status:** Implemented — self-service reset uses **Phase 14.7** tokens + **`sendMail`**. **Rate limits:** TODO (Phase **14.10+**). **Public launch remains NO-GO** until verification policy, rate limits, and broader gates are satisfied.

## Routes

| Path | Method | Purpose |
|------|--------|--------|
| **`/forgot-password`** | GET | Form: submit email |
| **`/reset-password?token=`** | GET | Form: set new password (token in query) |
| **`/api/auth/forgot-password`** | POST | `{ "email": "..." }` → always **200** + generic message when JSON valid |
| **`/api/auth/reset-password`** | POST | `{ "token": "...", "newPassword": "..." }` → **400** generic on invalid/expired token |

Email copy + link builder: **`src/lib/auth/password-reset-mail.ts`**.

## Enumeration safety

- **Forgot-password:** Response is the same whether the user exists, is disabled, or mail fails: *If an account exists for this email, password reset instructions will be sent shortly.* Server logs **`[auth/forgot-password] mail_failed`** with **`userId`** (no raw token) for operators. Mail (and DB token creation) runs **only** when the user exists, is **not** disabled, and **`password_hash` is set** — invited-but-pending users (**Phase 14.9**) use **`/accept-invite`**, not forgot-password.
- **Reset-password:** All token failures use one message: *This reset link is invalid or has expired…*

## Token lifecycle

- **Issue:** **`replacePasswordResetToken(userId, 60)`** — deletes unconsumed **`password_reset`** rows for that user, then creates a new token (**60-minute** TTL max). **`invite_accept` / `email_verify`** rows are untouched.
- **Consume:** **`completePasswordResetWithToken(plainToken, passwordHash)`** — single transaction: validate row, ensure user exists, **not disabled**, **has existing `password_hash`** (onboarding completes via invite), mark **`consumed_at`**, **`bcrypt`**-hash at cost **12** (matches **`manage-auth-user`**).
- **`emailVerified`:** Set to **now** on successful reset — completing a link sent to the inbox is treated as **email possession** for Promi’s closed-beta posture (not a substitute for a dedicated verification campaign).

## Mail / env

Same as **`docs/PHASE14_7_AUTH_TOKENS_MAIL.md`**: **`RESEND_API_KEY`**, **`PROMI_MAIL_FROM`**, **`PROMI_AUTH_EMAIL_DEV_LOG`** (local, non–product-ready only). Reset links prefer **`getPromiCanonicalAppUrl()`** (`PROMI_APP_URL` / fallbacks); else infer **`Origin` / `Referer` / request URL**.

## Sign-in UI

Promi uses the **default Auth.js** page at **`/api/auth/signin`**. Open **`/forgot-password`** directly (bookmark or link from your IdP). A custom **`pages.signIn`** route can be added later to embed “Forgot password?” inline.

## Manual test (local)

1. `npm run auth:user -- --action=create --email=tester@example.com --password='initialpass1' --confirm`
2. Set **`PROMI_AUTH_EMAIL_DEV_LOG=1`** (and no Resend key) **or** configure Resend.
3. `POST /api/auth/forgot-password` with `{ "email": "tester@example.com" }` or use **`/forgot-password`**.
4. Copy **`reset-password`** URL from console preview or email.
5. Submit new password on **`/reset-password`**; sign in at **`/api/auth/signin`**.
6. Reuse same token → **400** invalid.
7. Disable user → forgot flow still returns generic **200**; **no** email; reset link from old mail → **400** if still valid before disable (edge case).

## Related

- **`docs/PHASE14_7_AUTH_TOKENS_MAIL.md`**
- **`docs/PHASE14_9_INVITE_FLOW.md`** — first-time onboarding (`password_hash` null until accept).
- **`docs/PHASE14_ROUTE_PROTECTION_MATRIX.md`** — `/forgot-password`, `/reset-password` are **not** behind `proxy` JWT.

# Phase 14.9 — Invite-only onboarding (set password)

**Status:** Implemented — **no public signup**. Operators provision **`User`** rows with **`password_hash` NULL** until the invite is accepted. **Auth rate limits** are still **TODO** (Phase **14.10+**). **Public launch remains NO-GO.**

## Operator flow

1. **Invite (email + token in one step)**  
   ```bash
   npm run auth:user -- --action=invite --email=tester@example.com --confirm
   ```  
   - Creates the user if missing (`password_hash` **NULL**), or re-uses an existing **pending** user (same email, still no password).  
   - Replaces any unconsumed **`invite_accept`** tokens for that user (new **72h** TTL by default; override with **`--expiresMinutes=`**, max **14 days**).  
   - **Production** or **`PROMI_AUTH_PRODUCT_READY=1`:** requires **`RESEND_API_KEY`** before running (fails closed); sends via **`sendInviteMailCli`** (same policy as **`sendMail`**).  
   - **Non-production:** prints **`rawToken`** on stdout after a **SENSITIVE** stderr warning; also sends/logs if Resend / **`PROMI_AUTH_EMAIL_DEV_LOG=1`** is configured.

2. **Status**  
   ```bash
   npm run auth:user -- --action=status --email=tester@example.com
   ```  
   Includes **`pendingPasswordSetup: true`** when **`password_hash`** is null.

3. **Create user with password immediately (unchanged)**  
   `create` still requires **`--password=`** (min 8) and sets **`password_hash`** — not an invite.

4. **Re-issue token without email (dev/ops)**  
   ```bash
   npm run auth:user -- --action=issue-invite-token --email=tester@example.com --confirm
   ```  
   Only for users **without** a password yet. Invalidates prior unconsumed **`invite_accept`** tokens. Does **not** send email.

5. **Password reset (existing accounts)**  
   **`issue-reset-token`** / forgot-password apply only when **`password_hash`** is set. Invited-but-pending users use **invite**, not reset.

## End-user flow

- Open **`/accept-invite?token=…`** from email (or dev log).  
- Submit new password → **`POST /api/auth/accept-invite`**.  
- Success: token consumed, **`password_hash`** + **`email_verified`** set → sign in at **`/api/auth/signin`**.

## HTTP / mail

| Piece | Location |
|-------|----------|
| **`POST /api/auth/accept-invite`** | `app/api/auth/accept-invite/route.ts` |
| **`sendInviteEmail`** | `src/lib/auth/invite-mail.ts` |
| **Token helpers** | `replaceInviteAcceptToken`, `completeInviteAcceptWithToken` in `src/lib/auth/one-time-tokens.ts` |

## Schema

- **`users.password_hash`** is **nullable** (migration **`20260506140000_phase14_9_invite_nullable_password`**).

## Related

- **`docs/PHASE14_7_AUTH_TOKENS_MAIL.md`**, **`docs/PHASE14_8_PASSWORD_RESET.md`**, **`docs/PHASE14_10_RATE_LIMITS.md`**, **`docs/DEVELOPMENT.md`**, **`docs/INTERNAL_BETA_CHECKLIST.md`**, **`docs/PHASE14_ROUTE_PROTECTION_MATRIX.md`**

## Rate limits (Phase 14.10)

**`POST /api/auth/accept-invite`** is throttled per **IP** when internal beta is off. See **`docs/PHASE14_10_RATE_LIMITS.md`**.

## Recommended next phase (14.11+)

- Optional: dedicated **`email_verify`** flow separate from invite/reset; tune rate-limit numbers under production traffic.

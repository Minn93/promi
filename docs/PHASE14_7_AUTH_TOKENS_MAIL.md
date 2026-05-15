# Phase 14.7 — Auth one-time tokens + mail abstraction

**Status:** Token + mail foundation. **Password reset HTTP flow:** **`docs/PHASE14_8_PASSWORD_RESET.md`** (Phase **14.8**). **Invite HTTP** still TODO. **Public launch remains NO-GO.**

## Token schema (`auth_one_time_tokens`)

| Column | Purpose |
|--------|--------|
| `id` | Primary key (cuid) |
| `user_id` | FK → `users.id` (**cascade** on user delete) |
| `type` | `password_reset`, `invite_accept`, `email_verify`, … |
| `token_hash` | **HMAC-SHA256** of the raw token using **`AUTH_SECRET` / `NEXTAUTH_SECRET`** as key |
| `expires_at` | Reject consume after this time |
| `consumed_at` | Set once on successful consume (single-use) |
| `created_at` | Audit |
| `metadata` | Optional JSON for future flows |

**Constraints / indexes**

- **Unique** `(type, token_hash)` — lookup on consume; prevents duplicate hashes.
- **Index** `(user_id, type, created_at)` — list / invalidate future work.
- **Index** `expires_at` — cleanup jobs later.

**Security model**

- Raw token: **32 bytes**, **base64url** — shown **once** when created (email body or **dev-only** CLI stdout).
- **Never** store plaintext; **never** log raw token in application code or production CLI output.
- **Consume** runs in a transaction: load row, verify not consumed / not expired, **`updateMany`** with `consumed_at IS NULL` so concurrent double-submit yields at most one success.

Server helpers: **`src/lib/auth/one-time-tokens.ts`** — `createOneTimeToken`, `consumeOneTimeToken`, `replacePasswordResetToken`, `completePasswordResetWithToken`, `hashOneTimeTokenPlaintext`.

## Mail abstraction (`src/lib/mail/send-mail.ts`)

- **Transactional only** (reset, invite, verify — when wired). No marketing.
- **Resend** when **`RESEND_API_KEY`** is set (`resend` package). From header: **`PROMI_MAIL_FROM`** or Resend onboarding default (replace with verified domain before real delivery).
- **Fail closed** when **`NODE_ENV=production`** OR **`PROMI_AUTH_PRODUCT_READY=1`**: **no** `RESEND_API_KEY` → **`sendMail` throws** with a clear misconfiguration message.
- **Local / non–product-ready dev** without API key:
  - Set **`PROMI_AUTH_EMAIL_DEV_LOG=1`** to log **recipient + subject + truncated body** (no secrets).
  - Otherwise **`sendMail` throws** (avoid silent “email sent” when nothing was delivered).

## CLI (`npm run auth:user`)

| Action | Notes |
|--------|--------|
| `issue-reset-token` | Requires user row; **disabled** users rejected. **`--expiresMinutes=`** optional (default **60**). |
| `issue-invite-token` | Same; default expiry **4320** minutes (72h). |

- **Production:** prints JSON **without** `rawToken` (DB row metadata only).
- **Non-production:** prints **`rawToken`** on stdout after **stderr** “SENSITIVE” warning.

Hashing in the CLI **must** match **`hashOneTimeTokenPlaintext`** in **`one-time-tokens.ts`** (same env secrets, HMAC-SHA256).

## Related env

| Variable | Purpose |
|----------|--------|
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | **Required** for token HMAC |
| `RESEND_API_KEY` | Send via Resend |
| `PROMI_MAIL_FROM` | Verified sender, e.g. `Promi <auth@yourdomain.com>` |
| `PROMI_AUTH_EMAIL_DEV_LOG` | `1` in dev: log mail preview instead of sending when no Resend key |
| `PROMI_AUTH_PRODUCT_READY` | With production, enforces fail-closed mail when Resend missing |

## Next phase

- **Rate limits** on auth endpoints (login, forgot-password, reset-password, **accept-invite**) + cost APIs (**Phase 14.10+**).
- **Password reset:** invalidation of prior **`password_reset`** tokens — **`replacePasswordResetToken`** (14.8).
- **Invite:** HTTP + operator **`invite`** — **`docs/PHASE14_9_INVITE_FLOW.md`** (14.9).

## Related docs

- **`docs/PHASE14_9_INVITE_FLOW.md`**
- **`docs/PHASE14_3_AUTH_MVP_SPEC.md`** — roadmap
- **`docs/PHASE14_4_AUTH_USER_MODEL.md`** — `User` model
- **`docs/PHASE14_8_PASSWORD_RESET.md`**
- **`docs/DEVELOPMENT.md`** — env table
- **`docs/INTERNAL_BETA_CHECKLIST.md`**

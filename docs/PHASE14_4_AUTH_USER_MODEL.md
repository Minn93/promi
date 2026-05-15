# Phase 14.4 — Auth.js + Prisma User (implemented)

**Scope:** DB-backed **Credentials** for **`PROMI_AUTH_PRODUCT_READY=1`** deployments; **no** public signup. Invite + reset flows: **Phase 14.8+** (see **`docs/PHASE14_8_PASSWORD_RESET.md`**, **`docs/PHASE14_9_INVITE_FLOW.md`**).

## User model (`users`)

| Column | Purpose |
|--------|--------|
| `id` (cuid) | **Promi `owner_id`** for signed-in sessions (`session.user.id` / JWT `sub`) |
| `email` | Unique, stored **lowercase** |
| `password_hash` | **bcrypt** hash; **NULL** until invite accept (**14.9**) or **`create`** with password (never log) |
| `email_verified` | Nullable — set on successful reset/invite completion (**14.8+**) |
| `disabled` | Blocks sign-in when `true` |
| `created_at` / `updated_at` | Timestamps |

## Sign-in behavior

| `PROMI_AUTH_PRODUCT_READY` | Credentials source |
|----------------------------|--------------------|
| **`1` / true** | **`User`** table only (`bcrypt.compare`). No sign-in if **`password_hash`** is null (pending invite). **`AUTH_USER_*` env** is **not** used for authentication. |
| **off** (default) | **Env fallback:** `AUTH_USER_EMAIL` + `AUTH_USER_PASSWORD` (+ optional `AUTH_USER_ID`) for local/shell testing when DB users are not required. |

**Internal beta** (`PROMI_INTERNAL_BETA_MODE=1`): unchanged — **`getCurrentOwnerId()`** uses **`PROMI_INTERNAL_BETA_OWNER_ID`**; login is not required for API/page access.

## Production layout gating

| Condition | App shell |
|-----------|-----------|
| `NODE_ENV=production` ∧ `PROMI_INTERNAL_BETA_MODE=0` ∧ `PROMI_AUTH_PRODUCT_READY!=1` | **Blocked** (safety page) |
| `PROMI_INTERNAL_BETA_MODE=1` | Renders app (internal beta banner) |
| `PROMI_AUTH_PRODUCT_READY=1` (and not internal beta) | Renders app; **JWT** required on protected routes per **`proxy.ts`** |

**Public beta / open signup:** still **NO-GO** (see **`docs/PHASE14_3_AUTH_MVP_SPEC.md`**).

## Admin CLI (no HTTP)

Provision users (invite-only ops — **no** self-serve registration):

```bash
# Create (password min 8 chars; never echoed in logs beyond your shell)
npm run auth:user -- --action=create --email=tester@example.com --password='your-secret' --confirm

# Invite (no password until /accept-invite — see docs/PHASE14_9_INVITE_FLOW.md)
npm run auth:user -- --action=invite --email=tester@example.com --confirm

# Inspect
npm run auth:user -- --action=status --email=tester@example.com

npm run auth:user -- --action=disable --email=tester@example.com --confirm
npm run auth:user -- --action=enable --email=tester@example.com --confirm
```

## Local real-auth smoke

1. `PROMI_INTERNAL_BETA_MODE=0`, **`PROMI_AUTH_PRODUCT_READY=1`**, **`AUTH_SECRET`** set.
2. Create a user with **`npm run auth:user`**.
3. Visit app → sign in at **`/api/auth/signin`** with email/password.
4. Confirm **`session.user.id`** matches **`User.id`** and owner-scoped pages use that **`owner_id`**.

## Related

- **`docs/PHASE14_3_AUTH_MVP_SPEC.md`** — flags and roadmap
- **`docs/PHASE14_8_PASSWORD_RESET.md`**, **`docs/PHASE14_9_INVITE_FLOW.md`** — self-service auth
- **`docs/DEVELOPMENT.md`** — env reference
- **`src/lib/auth/next-auth.ts`** — `authorize()` implementation

## Next phases (14.5+)

Forgot/reset (HTTP): **`docs/PHASE14_8_PASSWORD_RESET.md`**. Invite (HTTP): **`docs/PHASE14_9_INVITE_FLOW.md`**. Dedicated email verification, auth rate limits. **`proxy.ts`**: **`docs/PHASE14_ROUTE_PROTECTION_MATRIX.md`** (Phase **14.6**). Token + mail foundation: **`docs/PHASE14_7_AUTH_TOKENS_MAIL.md`** (Phase **14.7**).

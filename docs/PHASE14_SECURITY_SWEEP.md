# Phase 14.1 — Security / cost sweep (public-exposure blockers)

**Purpose:** Close unauthenticated access to **cost-bearing** (`POST /api/generate` → OpenAI) and **mutation/storage** (`POST /api/uploads/scheduled-image` → disk) routes before any broader Internet exposure.

**Scope:** Route auth only — no architecture refactors, billing/Stripe changes, or new product features.

---

## Hardened routes (Phase 14.1)

| Route | Change |
|-------|--------|
| **`POST /api/generate`** | Requires resolved owner via **`getCurrentOwnerId()`** before JSON body read and before **`generatePromotionContent`**. Returns **`401`** with `{ "error": "authentication_required" }` when resolution fails (real-auth without session, misconfiguration, etc.). Internal beta: same as other owner-scoped paths — shared beta **`owner_id`** without login. Minimal **`ownerPrefix`** log only (no prompts/bodies). |
| **`POST /api/uploads/scheduled-image`** | Same owner gate **before** **`request.formData()`** and before any file write. Returns **`401`** via **`apiError`** when unauthenticated. Size/type limits unchanged. Minimal **`ownerPrefix`** log only. |

---

## Nearby routes reviewed (no change in 14.1)

| Route | Posture |
|-------|---------|
| **`POST /api/billing/checkout-session`** | Already uses **`getCurrentOwnerId()`** with **`401`** on failure. Billing flags + Stripe env gate checkout. |
| **`POST/GET /api/scheduled-posts`** | **`getCurrentOwnerId()`**; plan limits enforced on create. |
| **`GET /api/connected-accounts`** | **`getCurrentOwnerId()`**. |
| **`GET /api/oauth/.../start`** | **`getCurrentOwnerId()`**. |
| **`POST /api/jobs/process-due-scheduled-posts`** | **`Bearer CRON_SECRET`** (or dev-only scheduler bypass); not an end-user route. |

---

## Public launch status

**Still NO-GO** for public SaaS: auth productization (signup, reset, verification, rate limits), legal pages, **`/ops`** global aggregation review, and other Phase 14 items remain. This phase removes two critical unauthenticated cost/storage vectors.

---

## Related docs

- **`docs/DEVELOPMENT.md`** — API auth notes
- **`docs/INTERNAL_BETA_CHECKLIST.md`** — guardrail reminder

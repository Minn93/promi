# Phase 13.1-F — Manual entitlement end-to-end smoke (evidence)

Use this doc to record entitlement grant/revoke verification. Replace bracketed placeholders on copy; paste command output underneath.

---

## Evidence template

| Field | Value |
|--------|--------|
| Date/time (UTC) | |
| Environment | e.g. `local-dev` / `staging` / `production-internal-beta` |
| Commit SHA | `git rev-parse HEAD` |
| Operator | |
| **Test owner ID** | |
| PROMI_INTERNAL_BETA_OWNER_ID during UI checks | (must match **test owner** for internal-beta browser smoke, or use real-auth session for that owner) |

---

## Preconditions

1. `DATABASE_URL` set; migrations applied (`owner_entitlements`, `entitlement_audit_logs`).
2. Pick **`ownerId`** not used elsewhere, **or** run `npm run entitlement:manage -- --action=status --ownerId=<id>` until you understand current row state.
3. For **browser** `/upgrade` checks in internal beta: temporarily set **`PROMI_INTERNAL_BETA_OWNER_ID=<same ownerId>`** (and matching `NEXT_PUBLIC_…` if you mirror), **or** use real-auth with that owner’s session — otherwise the Upgrade page resolves a different owner than the CLI.

---

## Scenario (CLI)

1. Initial status:

   ```bash
   npm run entitlement:manage -- --action=status --ownerId=<ownerId>
   ```

2. (Optional bootstrap) If you need a repeatable **free/inactive** baseline on a blank owner:

   ```bash
   npm run entitlement:revoke -- --ownerId=<ownerId> --notes=phase13_1f_smoke_preclean
   ```

3. Grant Pro (notes match your ticket):

   ```bash
   npm run entitlement:grant -- --ownerId=<ownerId> --notes=phase13_1f_smoke
   ```

4. Re-check status (`planTier=pro`, `status=active`, `source=manual`):

   ```bash
   npm run entitlement:manage -- --action=status --ownerId=<ownerId>
   ```

5. Revoke:

   ```bash
   npm run entitlement:revoke -- --ownerId=<ownerId> --notes=phase13_1f_smoke_revoke
   ```

6. Re-check status (`planTier=free`, `status=inactive` — resolver treats as **free**):

   ```bash
   npm run entitlement:manage -- --action=status --ownerId=<ownerId>
   ```

7. Audit log tail (expect **grant** and **revoke** with your notes):

   ```bash
   npm run entitlement:audit -- --ownerId=<ownerId>
   ```

   Alias: `npm run entitlement:manage -- --action=audit --ownerId=<ownerId> [--limit=20]`

---

## Scenario (browser, manual)

With **same `ownerId`** as CLI (via internal-beta owner env or matching session):

1. **Before grant:** `/upgrade` — Free effective plan (or inactive manual row), manual request CTAs, server panel shows entitlement snapshot / fallback messaging.
2. **After grant (refresh):** Pro effective plan + manual-approval granted messaging when entitlement row matches **manual Pro active**.
3. **After revoke (refresh):** Free + request flow again.
4. **Production redirects:** Confirm `NODE_ENV=production` build forbids playable checkout (`/upgrade/checkout`, `/upgrade/success` redirect to `/upgrade`; see source `app/upgrade/checkout/page.tsx` and `app/upgrade/success/page.tsx`). Spot-check deployed host if applicable.

---

## Server limit alignment (manual / spot checks)

Limits should follow **`getPlanTierForOwner(ownerId)`** (same resolver as Upgrade UI):

- **Scheduled posts:** `app/api/scheduled-posts/route.ts`
- **Connected accounts:** `src/lib/services/connected-accounts/service.ts` (+ OAuth start route uses plan config)
- **Analytics ranges:** `app/analytics/page.tsx`

Record concrete checks (counts, screenshots, HTTP status):

| Check | Expected with Pro entitlement | Evidence |
|--------|-------------------------------|----------|
| Scheduled-post cap | Matches `PLAN_CONFIG.pro.limits.scheduledPostsActive` | |
| Connect account cap | Matches `PLAN_CONFIG.pro.limits.connectedAccounts` | |
| Analytics plan label / range cap | Matches pro tier where applicable | |

---

## Decision

- [ ] **GO** — Grant/revoke + audit acceptable; Upgrade UX and redirects behave as documented; limits align with entitlement when exercised.
- [ ] **NO-GO** — Blocking issue: _______________

Approver / date:

---

## Recorded run — 2026-05-04 (automated CLI sample, developer workstation)

(This section is example evidence from one successful local execution; replicate in your environment for official sign-off.)

| Field | Value |
|--------|--------|
| Date/time (UTC) | **2026-05-04T12:16Z** (commands run sequentially) |
| Environment | Local dev (Postgres via `DATABASE_URL`) |
| Commit SHA | **`cb9ae3fdb6b7a0c0cea34068343a6806602daafc`** (before committing Phase 13.1-F docs + `audit` action; amend after pushing this doc) |
| Test owner ID | **`phase13_1f_smoke_owner`** |

**Initial status:** No `owner_entitlements` row (`planTier: null`, resolver fallback note printed).

**Preclean revoke (optional):** Creates `free` / `inactive` / `manual`, notes `phase13_1f_smoke_preclean`, audit row with `previousPlanTier: null`.

**Grant:** Outcome `updated`, `planTier=pro`, `status=active`, `source=manual`, notes `phase13_1f_smoke`.

**Post-grant status:** Matches Pro manual active row above.

**Revoke:** Outcome `updated`, `planTier=free`, `status=inactive`, notes `phase13_1f_smoke_revoke`.

**Post-revoke status:** `free` / `inactive`; resolver resolves to **free**.

**Audit sample (newest first):**

- `revoke` ← `phase13_1f_smoke_revoke` (`pro → free`, `active → inactive`)
- `grant` ← `phase13_1f_smoke` (`free → pro`, `inactive → active`)
- `revoke` ← `phase13_1f_smoke_preclean` (bootstrap from no row)

**Production redirect check:** Verified in source — both checkout and success call `redirect("/upgrade")` when `NODE_ENV === "production"` (see `app/upgrade/checkout/page.tsx`, `app/upgrade/success/page.tsx`). Deployed-host GET requests should still be exercised for GO in production-internal-beta.

**Browser /upgrade + limit probes:** Left to operator with **`PROMI_INTERNAL_BETA_OWNER_ID=phase13_1f_smoke_owner`** alignment (see Preconditions).

**GO/NO-GO (CLI slice):** **GO** for grant/revoke persistence and audit trail; full GO requires bracketed manual UI + production spot-check as above.

---

## Change log for this phase (tooling only)

Phase 13.1-F adds a **read-only** CLI action:

- `--action=audit` on `manage-entitlement.mjs`
- Convenience script: **`npm run entitlement:audit -- --ownerId=<owner_id>`**

No schema, resolver, plan-limit, payment, or app API surface changes beyond this operator aid.

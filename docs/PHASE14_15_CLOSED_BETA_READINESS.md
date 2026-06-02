# Phase 14.15 — Closed beta GO/NO-GO readiness

**Status:** decision artifact for **invite-only closed beta**.  
**Public launch:** **NO-GO** (unchanged).  
**Scope:** docs/process only.

---

## 1) Readiness modes

| Mode | Definition | Current posture |
|------|------------|-----------------|
| **Internal beta** | Single-owner/internal operator workflows; internal-beta bypass behavior allowed. | **GO** (current supported baseline) |
| **Multi-account self-test rehearsal** | Operator-controlled 3-5 account pre-beta simulation (not real external cohort). | **PASS (3-account operator-controlled rehearsal complete)** |
| **Invite-only closed beta** | Real-auth DB users, invite-only onboarding, controlled tester cohort, operator-managed access. | **GO (when real testers are available)** / **PARTIAL GO (broader expansion)** |
| **Public free beta** | Open external signup/self-serve access without invite gate. | **NO-GO** |
| **Public paid launch** | Public paid checkout (including live commercial posture). | **NO-GO** |

---

## 2) Audit summary by area (invite-only closed beta)

| Area | Status | Notes |
|------|--------|-------|
| Auth | **GO** | DB `User` + Credentials + invite/reset/accept foundations are in place. |
| Owner isolation | **GO** | Owner-scoped routes + adversarial checks documented; route protections and owner filters active. |
| Billing (test mode) | **PARTIAL** | Test-mode checkout/webhook upgrade-downgrade/manual-lock evidence exists; not approved for live mode/public paid launch. |
| X publishing | **PARTIAL** | X real path is available behind env gates; Instagram/Facebook real publish remains mock-only. |
| Scheduler | **GO** | Secret-auth model and owner propagation are in place; unchanged by this phase. |
| Rate limits | **GO** | Auth + cost-bearing limits documented and gated by environment/store policy. |
| Account gates | **GO** | High-risk + owner-sensitive reads/mutations + OAuth callback parity covered; disabled-session strategy is route-level DB recheck. |
| Ops/admin | **PARTIAL** | `/ops` is allowlisted and gated, but still a global aggregate surface (intentional operator scope). |
| Legal/trust/commercial | **NO-GO** | Public/legal/commercial launch posture not complete; this remains invite-only only. |
| Deployment/env | **GO** | Preflight/checklist/branch protection and env guardrails are documented. |
| Monitoring | **PARTIAL** | `billing:health` and runbooks are in place; broader production observability/sign-off remains rollout-dependent. |

---

## 3) Invite-only closed beta verdict (GO/PARTIAL/NO-GO)

**Verdict:** **PASS for multi-account self-test rehearsal (operator-controlled 3 accounts)**, **GO for tiny invite-only cohort when real testers are available**, while broader expansion remains **PARTIAL GO** until cohort evidence is complete.

Rationale:
- Core auth, isolation, route/account gates, and process guardrails are sufficiently hardened for controlled external testers.
- Critical launch boundaries remain intentionally closed (public signup, public paid launch, Stripe live mode, broad ops access).
- First external tester rehearsal is now recorded as PASS (`docs/PHASE14_17_FIRST_TESTER_EVIDENCE.md`).
- Multi-account pre-beta rehearsal completed as PASS in operator-controlled mode (`docs/PHASE14_18A_MULTI_ACCOUNT_SELF_TEST_EVIDENCE.md`); this is not external cohort completion.
- External tester handoff materials are prepared (`docs/PHASE14_19_EXTERNAL_TESTER_HANDOFF.md`) for invite-only real tester execution when testers are available.
- External tester recruitment copy pack is prepared (`docs/PHASE14_20_EXTERNAL_TESTER_RECRUITMENT_COPY.md`) with non-public-launch wording and invite-only boundaries.
- Some controls remain accepted-risk/deferred for this stage (section 4).

---

## 4) Deferred with accepted risk (invite-only only)

| Item | Disposition | Why accepted now |
|------|-------------|------------------|
| JWT global immediate revocation | **Deferred with accepted risk** | Route-level DB rechecks block disabled users on sensitive endpoints without broad auth migration. |
| Token/session versioning field | **Deferred with accepted risk** | Adds schema/auth callback complexity beyond minimum closed-beta needs. |
| DB-backed Auth session adapter migration | **Deferred with accepted risk** | Architectural change; not required for invite-only staged rollout. |
| Non-X real publishing parity | **Deferred with accepted risk** | Not required for closed-beta access control safety gate. |

---

## 5) Required manual evidence before invite-only GO

All evidence should be recorded with date, environment, operator, and commit SHA.

- **Phase 14.12 real-auth DB-user smoke** (`docs/PHASE14_12_REAL_AUTH_SMOKE.md`)
- **Phase 14.14 disabled-session smoke** (`docs/PHASE14_11_ACCOUNT_STATUS_GATES.md` checklist)
- `npm run billing:health` **PASS**
- `npm run preflight:internal-beta` **PASS**
- Owner isolation smoke (`npm run smoke:owner-isolation` + adversarial checks in checklist/docs)
- Invite/reset smoke (`/forgot-password`, `/reset-password`, `/accept-invite` flows)

If any required evidence fails or is missing, status is **NO-GO** for external tester invites.

---

## 6) Required before first external tester

1. Deploy a target environment with real-auth flags aligned (`PROMI_INTERNAL_BETA_MODE=0`, `PROMI_AUTH_PRODUCT_READY=1`, auth secrets configured).
2. Confirm Upstash rate-limit store is configured per production/real-auth policy.
3. Re-run and capture:
   - `npm run lint`
   - `npm run build`
   - `npm run preflight:internal-beta`
   - `npm run billing:health`
4. Complete and attach manual evidence in section 5.
5. Verify operator access boundaries:
   - `/ops` restricted via `PROMI_OPS_OWNER_IDS` or explicit operator override policy.
6. Execute first-tester controlled rehearsal runbook:
   - `docs/PHASE14_16_FIRST_TESTER_ROLLOUT.md`
7. Invite one controlled tester account only (no open signup), then run first-tester smoke on sign-in/invite/reset/owner isolation.

---

## 7) Must remain disabled

- **Public signup** (no open self-serve registration)
- **Public paid launch** messaging/positioning
- **Stripe live mode** (live keys/live paid traffic) unless separately approved through `docs/PHASE13_2_9_LIVE_MODE_READINESS.md`
- **Broad `/ops` access** (must remain operator allowlist/override only)

---

## 8) Rollback plan (closed beta safety)

If incidents occur during closed-beta rollout:

1. Disable real-auth product-ready shell path: set **`PROMI_AUTH_PRODUCT_READY=0`**.
2. Return to internal-beta posture: set **`PROMI_INTERNAL_BETA_MODE=1`** and `NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE=1`.
3. Disable billing mutations/webhook processing path: set **`PROMI_BILLING_ENABLED=0`**.
4. Disable affected users quickly via CLI (`npm run auth:user -- --action=disable --email=<email> --confirm`).
5. Revoke manual entitlements as needed (`npm run entitlement:revoke -- --ownerId=<owner> --confirm`).
6. Re-run `npm run preflight:internal-beta` and `npm run billing:health` after rollback config is applied.

---

## 9) Final decision record template

| Field | Value |
|------|-------|
| Date/time (UTC) | |
| Environment | |
| Commit SHA | |
| Decision | **GO / PARTIAL GO / NO-GO** |
| Approver | |
| Notes / accepted risks | |

---

## 10) Remaining PARTIAL items before wider cohort

- Billing remains **test/manual** only (no live Stripe launch posture).
- X real publishing parity remains partial across platforms (non-X publish remains mock-only).
- Monitoring/operational maturity remains partial for broader rollout scale.
- `/ops` remains intentionally restricted global-aggregate operator surface.
- External usability feedback from real tiny-cohort users remains pending.
- Real tiny-cohort evidence remains pending while testers are unavailable; run Phase 14.18A self-test meanwhile.

---

## Related docs

- `docs/INTERNAL_BETA_CHECKLIST.md`
- `docs/DEVELOPMENT.md`
- `docs/PHASE14_12_REAL_AUTH_SMOKE.md`
- `docs/PHASE14_11_ACCOUNT_STATUS_GATES.md`
- `docs/PHASE14_ROUTE_PROTECTION_MATRIX.md`
- `docs/PHASE14_16_FIRST_TESTER_ROLLOUT.md`
- `docs/PHASE14_17_FIRST_TESTER_EVIDENCE.md`
- `docs/PHASE14_18A_MULTI_ACCOUNT_SELF_TEST_EVIDENCE.md`
- `docs/PHASE14_19_EXTERNAL_TESTER_HANDOFF.md`
- `docs/PHASE14_20_EXTERNAL_TESTER_RECRUITMENT_COPY.md`
- `docs/PHASE13_2_7_BILLING_SOAK_PLAN.md`
- `docs/PHASE13_2_9_LIVE_MODE_READINESS.md`

# Phase 14.17 — First external tester rehearsal evidence

**Scope:** execute first-tester controlled rollout rehearsal from `docs/PHASE14_16_FIRST_TESTER_ROLLOUT.md`.  
**Result for this run:** **PASS** for first external tester rehearsal (single tester, invite-only boundary preserved).

---

## 1) Run metadata

| Field | Value |
|------|-------|
| Date/time (UTC) | 2026-05-12T13:xx:xxZ (operator record; fill exact minute if needed) |
| Target URL | `http://localhost:3000` |
| Environment | Local non-production rehearsal |
| Commit SHA | `871485d747bbf2c868f2539ffd2f5a4eb45f3f5d` |
| Operator | (fill) |
| Approver | (fill) |
| Tester alias | `tester-phase1417-01` |
| Tester PII policy | Alias-only in docs; no raw tokens or direct email committed |

---

## 2) Target mode checks

| Check | Expected | Result |
|------|----------|--------|
| Internal beta disabled | `internalBetaMode=false` | **PASS** (`/api/debug/current-owner`) |
| Product-ready auth enabled | `authProductReady=true` | **PASS** (`/api/debug/current-owner`) |
| Invite-only boundary | no public signup | **PASS** (policy/docs unchanged) |
| Stripe live mode disabled | must remain disabled | **PASS** (no live-mode changes made) |
| `/ops` boundary | operator-only | **PASS** (tester remained non-allowlisted; operator-only access preserved) |

---

## 3) Fresh command evidence

| Command | Result | Notes |
|--------|--------|-------|
| `npm run lint` | **PASS** | Existing known warning only (`@next/next/no-img-element`) |
| `npm run build` | **PASS** | Build succeeded |
| `npm run preflight:internal-beta` | **PASS** | Checks/build succeeded |
| `npm run billing:health` | **PASS** | 0 critical drift |

---

## 4) Invite execution + acceptance

Executed (redacted):

```bash
npm run auth:user -- --action=invite --email=<tester-alias-redacted> --confirm
```

Manual confirmations:

- Invite email delivered successfully
- Tester opened accept-invite link
- Password set successfully
- Login succeeded
- `emailVerified` gate behavior consistent with successful invite acceptance flow

No token strings or raw invite links are recorded in repo evidence.

---

## 5) Functional smoke status

| Item | Status | Notes |
|------|--------|-------|
| Tester accept-invite | **PASS** | Invite token consumed; password set |
| Tester login | **PASS** | Real-auth session established |
| Generate/create flow | **PASS** | Content generation and create flow succeeded |
| Schedule flow | **PASS** | Post created/scheduled successfully |
| Own scheduled/history checks | **PASS** | Tester can view own scheduled/history |
| Published lifecycle check | **PASS** | History reached Published successfully |
| Owner isolation checks | **PASS** | No cross-owner data leakage observed |
| Tester access to `/ops` | **PASS** | Remained protected (operator-only boundary intact) |
| Billing/upgrade posture check | **PASS** | Manual/test posture as expected; no live/public paid behavior introduced |

---

## 6) Rollback rehearsal status

Executed operator control-path rehearsal on existing test user(s):

- status -> disable -> status -> enable -> status (all succeeded)

Outcome:
- **PASS** for CLI rollback controls (disable/enable operations).
- Disabled-session control behavior remained consistent with route-level account gates.
- Tester account final state should follow operator decision (active for controlled cohort, or disabled after rehearsal).

---

## 7) Bugs/blockers

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| R14.17-1 | High (previous blocker) | Invite mail configuration for product-ready mode was required before first tester execution. | **Resolved for this rehearsal run** |

No runtime code/schema/billing logic changes were made in this phase.

---

## 8) Decision

**Decision:** **GO** for one-tester controlled invite-only rehearsal.

**What passed:**
- mode boundary checks
- lint/build/preflight/billing-health evidence
- invite delivery + accept-invite + login
- generate/create + schedule/history/published flow
- owner isolation checks
- `/ops` boundary protection
- operator disable/enable rollback control path

**What failed:**
- None in this rehearsal scope.

**Known remaining partials (program-level, not rehearsal failure):**
- Billing remains test/manual posture only (no live paid launch).
- Non-X real publish parity remains partial.
- Wider operational maturity/monitoring remains partial.
- `/ops` remains intentionally restricted to operator scope.

---

## 9) Related docs

- `docs/PHASE14_16_FIRST_TESTER_ROLLOUT.md`
- `docs/PHASE14_15_CLOSED_BETA_READINESS.md`
- `docs/INTERNAL_BETA_CHECKLIST.md`

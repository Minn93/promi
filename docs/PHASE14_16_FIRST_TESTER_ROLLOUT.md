# Phase 14.16 — First external tester controlled rollout rehearsal

**Status:** controlled rollout runbook + evidence template (invite-only only).  
**Public free beta:** **NO-GO**.  
**Public paid launch / Stripe live mode:** **NO-GO**.

---

## 1) Allowed operating mode (hard boundaries)

This rehearsal is valid only when all conditions hold:

- **Invite-only closed beta** (`PROMI_INTERNAL_BETA_MODE=0`, `PROMI_AUTH_PRODUCT_READY=1`)
- **No public signup** (users created/invited by operator only)
- **No Stripe live mode** (test/manual billing posture only)
- **`/ops` remains operator-only** (`PROMI_OPS_OWNER_IDS` or explicit operator override policy)
- **Limited tester count**: start with **1 tester** (max tiny cohort explicitly approved by approver)

If any boundary is violated, mark rehearsal **NO-GO** and execute rollback.

---

## 2) Rollout record (fill before execution)

| Field | Value |
|------|-------|
| Date/time (UTC) | |
| Target environment | |
| Commit SHA | |
| Operator (executor) | |
| Approver (go/no-go authority) | |
| Tester label (redacted alias) | |
| Tester email (redact in committed doc if needed) | |
| Support contact (on-call) | |
| Rollback owner | |

---

## 3) Environment + command evidence (must capture)

Record command output snippets or references (no secrets).

| Check | Required result | Evidence |
|------|------------------|----------|
| `npm run lint` | PASS (existing known warnings may be acceptable if unchanged) | |
| `npm run build` | PASS | |
| `npm run preflight:internal-beta` | PASS | |
| `npm run billing:health` | PASS (0 critical drift) | |

Also attach:
- `docs/PHASE14_12_REAL_AUTH_SMOKE.md` latest evidence
- Phase 14.14 disabled-session smoke evidence
- Owner isolation smoke evidence
- Invite/reset smoke evidence
- `/ops` access-boundary verification evidence

---

## 4) First tester execution checklist

### 4.1 Invite creation

- [ ] Confirm tester count is within approved limit.
- [ ] Run invite command:

```bash
npm run auth:user -- --action=invite --email=<tester-email> --confirm
```

- [ ] Record expected delivery path:
  - production/product-ready with mail configured: invite email delivered
  - approved non-prod/dev path: dev log output only
- [ ] Do not commit token values, raw mail payloads, or personal data.

### 4.2 Invite accept + sign-in

- [ ] Tester opens `/accept-invite?token=...` and sets password.
- [ ] Tester signs in via `/login` (canonical user-facing sign-in page).
- [ ] Confirm account is active/not disabled and flows proceed without policy-gate errors.

### 4.3 Core smoke (tester account)

- [ ] Create flow renders and saves draft/input safely.
- [ ] Generate path works (or expected policy/rate-limit behavior appears).
- [ ] Schedule a post (`/api/scheduled-posts` create).
- [ ] Scheduled list/detail loads.
- [ ] History entry appears in `/api/post-history`.

### 4.4 Isolation + policy checks

- [ ] Verify tester cannot access another owner’s scheduled/history resources.
- [ ] Verify account-gate policy behavior remains correct for disabled-session controls (can be done with operator test user if not on tester account).
- [ ] Confirm `/ops` is not available to tester unless tester is explicitly in operator allowlist (default: should be denied).

### 4.5 Billing posture check

- [ ] Confirm billing mode is still intended (manual/test only).
- [ ] Confirm no live Stripe keys, no public paid messaging.
- [ ] If checkout is enabled in test mode, confirm it is invite-only controlled and evidence-safe.

---

## 5) Evidence handling rules

- Store only safe summaries and redacted outputs in committed docs.
- Allowed: route result codes/messages, high-level screenshots without secrets.
- Not allowed in repo:
  - raw auth/invite/reset tokens
  - API secrets/keys/webhook signatures
  - unredacted tester PII when policy requires redaction

---

## 6) Rollback playbook (first-tester incident response)

Apply one or more steps based on incident severity:

1. **Disable tester account**
   - `npm run auth:user -- --action=disable --email=<tester-email> --confirm`
2. **Revoke entitlement if granted**
   - `npm run entitlement:revoke -- --ownerId=<owner-id> --confirm`
3. **Connected account cleanup**
   - disconnect/revoke affected connected accounts through operator flow
4. **Scheduled content cleanup**
   - cancel pending scheduled posts and verify no unintended publish remains queued
5. **Auth rollout rollback**
   - set `PROMI_AUTH_PRODUCT_READY=0` if real-auth rollout is unstable
6. **Return to internal-only mode**
   - set `PROMI_INTERNAL_BETA_MODE=1` (+ `NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE=1`)
7. **Billing safety stop**
   - set `PROMI_BILLING_ENABLED=0` if checkout appears unexpectedly
8. Re-run:
   - `npm run preflight:internal-beta`
   - `npm run billing:health`

---

## 7) GO / NO-GO decision (first tester)

| Criterion | Status |
|----------|--------|
| Boundaries in section 1 enforced | |
| Section 3 command evidence complete | |
| Section 4 execution checks complete | |
| Section 5 evidence hygiene satisfied | |
| Rollback owner acknowledged | |

**Decision:** `GO` / `PARTIAL GO` / `NO-GO`  
**Approver sign-off (name/date):**  
**Notes / accepted risk:**

---

## Related docs

- `docs/PHASE14_15_CLOSED_BETA_READINESS.md`
- `docs/PHASE14_17_FIRST_TESTER_EVIDENCE.md`
- `docs/INTERNAL_BETA_CHECKLIST.md`
- `docs/PHASE14_12_REAL_AUTH_SMOKE.md`
- `docs/PHASE14_11_ACCOUNT_STATUS_GATES.md`
- `docs/PHASE14_ROUTE_PROTECTION_MATRIX.md`

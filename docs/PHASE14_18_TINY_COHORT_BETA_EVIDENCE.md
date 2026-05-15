# Phase 14.18 — Tiny cohort beta expansion evidence (3-5 testers)

**Scope:** controlled expansion from first tester to a tiny invite-only cohort.  
**Launch posture:** invite-only only; **public free/public paid remain NO-GO**.

---

## 1) Cohort run metadata

| Field | Value |
|------|-------|
| Date/time (UTC) | |
| Target environment | |
| Target URL | `https://usepromi.app` (canonical) |
| Commit SHA | |
| Operator | |
| Approver | |
| Cohort size target | `3`-`5` |
| Actual testers completed | |
| Billing posture | Manual/test only (no Stripe live mode) |
| `/ops` policy | Operator-only allowlist |

---

## 2) Allowed mode confirmation (must all be true)

- [ ] Invite-only flow only (no public signup path).
- [ ] Public paid launch remains disabled.
- [ ] Stripe live mode remains disabled.
- [ ] `/ops` remains operator-only.
- [ ] Cohort size remains within 3-5 testers.

If any item fails, mark cohort result **FAIL** and execute rollback procedure.

---

## 3) Operator runbook (repeat per tester)

1. Invite tester (alias-tracked):

```bash
npm run auth:user -- --action=invite --email=<tester-email> --confirm
```

2. Ask tester to complete core flow (accept invite, set password, sign in, generate/create, schedule/history).
3. Capture per-tester evidence row in section 4.
4. Spot-check `/ops` boundary for tester account (should remain denied unless explicitly allowlisted as operator).
5. Record bugs/feedback and follow-up status.
6. Mark tester result: **PASS / PARTIAL / FAIL**.

---

## 4) Per-tester checklist table (repeat rows for each tester)

Use tester alias only. Do not commit raw tokens or unnecessary PII.

| Tester alias | Invite sent | Invite delivered | Accept invite opened | Password set | Login succeeded | Generate/create succeeded | Schedule flow succeeded | Scheduled list verified | History verified | Published lifecycle verified | Owner isolation verified | `/ops` boundary spot check | Feedback captured | Issues/bugs recorded | Final result |
|-------------|-------------|------------------|----------------------|--------------|-----------------|---------------------------|-------------------------|-------------------------|------------------|-----------------------------|--------------------------|----------------------------|-------------------|----------------------|-------------|
| tester-01 | | | | | | | | | | | | | | | PASS / PARTIAL / FAIL |
| tester-02 | | | | | | | | | | | | | | | PASS / PARTIAL / FAIL |
| tester-03 | | | | | | | | | | | | | | | PASS / PARTIAL / FAIL |
| tester-04 | | | | | | | | | | | | | | | PASS / PARTIAL / FAIL |
| tester-05 | | | | | | | | | | | | | | | PASS / PARTIAL / FAIL |

---

## 5) Cohort-level GO gate

Tiny cohort can be marked **PASS** only if all conditions are met:

- [ ] At least **3 testers** complete core flow end-to-end.
- [ ] No owner-isolation leak is found.
- [ ] `/ops` remains protected for non-operator testers.
- [ ] No critical publish/schedule failure remains unresolved.
- [ ] All serious issues are documented with follow-up status.

If any condition is unmet, result must be **PARTIAL** or **FAIL** with clear blocker notes.

---

## 6) Cohort issues and follow-up

| Issue ID | Severity | Summary | Affects testers | Status | Owner | Follow-up phase |
|---------|----------|---------|-----------------|--------|-------|-----------------|
| | | | | Open / Mitigated / Resolved | | |

---

## 7) Cohort decision

| Decision field | Value |
|---------------|-------|
| Tiny cohort result | **PASS / PARTIAL / FAIL** |
| Approver sign-off | |
| Date/time (UTC) | |
| Notes / accepted risk | |

---

## Evidence hygiene notes

- Keep tester identities redacted to aliases in committed docs.
- Never commit invite/reset tokens, session cookies, secrets, or webhook signatures.
- Summarize route/API outcomes safely (status/result) without sensitive payloads.

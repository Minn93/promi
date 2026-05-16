# Phase 14.18A — Multi-account self-test rehearsal evidence

**Purpose:** pre-beta rehearsal using operator-controlled accounts to simulate a tiny cohort flow.  
**Important:** this is **not** a real external beta cohort completion result.

---

## Scope and posture

- Invite-only posture remains in place.
- `/ops` remains operator-only.
- Public free beta remains NO-GO.
- Public paid launch / Stripe live mode remains NO-GO.
- This phase validates readiness before real tiny-cohort external testers are available.

---

## 1) Rehearsal metadata

| Field | Value |
|------|-------|
| Date/time (UTC) | |
| Environment | |
| Target URL | `https://usepromi.app` (canonical) |
| Commit SHA | |
| Operator | |
| Approver | |
| Planned self-test accounts | `3`-`5` |
| Completed self-test accounts | |

---

## 1.1) Pre-self-test production X OAuth verification snapshot

Recorded before running multi-account self-test:

| Check | Result | Notes |
|------|--------|-------|
| `/terms` production load | PASS | `https://usepromi.app/terms` |
| `/privacy` production load | PASS | `https://usepromi.app/privacy` |
| X OAuth start origin | PASS | Started from `https://usepromi.app/settings/accounts` |
| X callback on canonical domain | PASS | Callback flow completed on `https://usepromi.app/api/oauth/x/callback` |
| Final success redirect | PASS | Landed on `https://usepromi.app/settings/accounts?connected=x` |
| Connected account UI/update | PASS | UI reflected successful connection/update |
| Canonical link hygiene (`example.com` / `www` / `promi-pi`) | PASS | No canonical links observed using those hosts |
| `/ops` operator-only boundary | PASS | Non-operator access returned `404 / Not Found` in production smoke |

---

## 1.2) Production single-account smoke gate (pre-14.18A)

| Check | Result | Notes |
|------|--------|-------|
| Login (`https://usepromi.app/login`) | PASS | Credentials flow completed successfully |
| X login/connect flow | PASS | Callback + connected account behavior normal |
| Schedule/upload flow | PASS | End-to-end action worked |
| History display | PASS | Expected activity visible |
| Owner isolation | PASS | No other account data visible |
| Invite-only posture | PASS | No public signup exposure introduced |

Decision: **READY TO BEGIN Phase 14.18A multi-account self-test** (start with 3 accounts).

---

## 2) Per-account checklist

Use test account emails intended for rehearsal. Redact as needed in committed evidence.

| Test account email | Invite sent | Invite email delivered | Accept invite opened | Password set | Login succeeded | Logout/sign-out works and returns to `/login` | Switching accounts shows correct signed-in email | Generate/create succeeded | Schedule flow succeeded | Scheduled list verified | History verified | Published lifecycle verified | Owner isolation verified | `/ops` boundary blocked for this account | Issues/bugs recorded | Final account result |
|--------------------|-------------|------------------------|----------------------|--------------|-----------------|-----------------------------------------------|-----------------------------------------------|---------------------------|-------------------------|-------------------------|------------------|-----------------------------|--------------------------|------------------------------------------|----------------------|----------------------|
| test-account-01 | | | | | | PASS / FAIL | PASS / FAIL | | | | | | | | | PASS / PARTIAL / FAIL |
| test-account-02 | | | | | | PASS / FAIL | PASS / FAIL | | | | | | | | | PASS / PARTIAL / FAIL |
| test-account-03 | | | | | | PASS / FAIL | PASS / FAIL | | | | | | | | | PASS / PARTIAL / FAIL |
| test-account-04 | | | | | | PASS / FAIL | PASS / FAIL | | | | | | | | | PASS / PARTIAL / FAIL |
| test-account-05 | | | | | | PASS / FAIL | PASS / FAIL | | | | | | | | | PASS / PARTIAL / FAIL |

---

## 3) Cohort-level self-test gate

Mark multi-account self-test **PASS** only if all are true:

- [ ] At least **3 separate test accounts** complete core flow end-to-end.
- [ ] No owner-isolation leak is found.
- [ ] `/ops` remains protected from all non-operator test accounts.
- [ ] Logout/sign-out works and redirects to `/login` for each tested account.
- [ ] Switching accounts shows the correct signed-in email in Settings.
- [ ] No critical schedule/publish failure remains unresolved.
- [ ] Issues are documented with follow-up status.

If any gate fails, mark result **PARTIAL** or **FAIL** with blocker notes.

---

## 4) Operator runbook (short)

1. Create or prepare `3`-`5` test emails.
2. Invite each test account.
3. Complete full core flow per account.
4. Verify cross-account isolation.
5. Verify `/ops` is blocked for non-operator accounts.
6. Record evidence in section 2 and issues in section 5.
7. Decide self-test result: PASS / PARTIAL / FAIL.

---

## 5) Issues and follow-up

| Issue ID | Severity | Summary | Affected accounts | Status | Owner | Follow-up phase |
|---------|----------|---------|-------------------|--------|-------|-----------------|
| | | | | Open / Mitigated / Resolved | | |

---

## 6) Decision

| Decision field | Value |
|---------------|-------|
| Multi-account self-test result | **PASS / PARTIAL / FAIL** |
| Approver sign-off | |
| Date/time (UTC) | |
| Notes / accepted risk | |

---

## 7) Next-step note

If this rehearsal passes, proceed to real tiny-cohort external testers when available.  
Until then, do **not** represent this as external beta completion.

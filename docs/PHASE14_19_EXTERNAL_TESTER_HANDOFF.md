# Phase 14.19 — Real External Tester Handoff Prep

**Purpose:** prepare operator-ready materials for real external testers under invite-only closed beta.  
**Scope:** documentation and execution templates only (no product behavior changes).  
**Important:** this does **not** imply public launch readiness.

---

## 1) Current posture (carry-over from 14.18A)

- Phase 14.18A operator-controlled 3-account self-test: **PASS**
- Tiny invite-only real external cohort: **GO when testers are available**
- Broader expansion: **PARTIAL GO**
- Billing: **test/manual only** (no live paid launch)
- Real publish parity: **X-focused; non-X remains partial**
- `/ops` remains **operator-only**

---

## 2) External tester invitation template

Use this message as-is (edit bracketed fields only):

```text
Subject: Promi invite-only beta access

Hi [Tester Name],

You’re invited to a small, invite-only Promi beta test.

What to expect:
- This is a limited beta (not public launch).
- Real publish flow is currently focused on X.
- Billing is not a live paid launch in this phase.

Please use the invite email link to set your password and sign in at:
https://usepromi.app/login

Core checklist:
1) Accept invite + set password
2) Sign in and confirm your signed-in email in Settings
3) Connect X account (if applicable)
4) Create/generate content
5) Schedule/upload
6) Verify History/Published lifecycle
7) Sign out and confirm return to /login

When reporting issues, include:
- screenshot
- approximate time (with timezone)
- account email used
- short repro steps

Thanks,
[Operator Name]
```

---

## 3) Tester instruction checklist (share with tester)

- [ ] Open invite link (host should be `https://usepromi.app`)
- [ ] Complete password setup
- [ ] Log in at `https://usepromi.app/login`
- [ ] Verify Settings shows the correct signed-in email
- [ ] Confirm expected plan display (usually Free unless explicitly granted)
- [ ] Connect/login with X (if included in test scope)
- [ ] Create/generate one post
- [ ] Schedule/upload one post
- [ ] Confirm History / Published lifecycle appears as expected
- [ ] Sign out and confirm redirect to `/login`
- [ ] Confirm no stale previous-account data is visible after sign-out

---

## 4) Tester feedback capture template

Use one record per tester session:

| Field | Value |
|------|-------|
| Tester alias/email | |
| Date/time (local + UTC) | |
| Environment URL | `https://usepromi.app` |
| Invite delivered | PASS / FAIL |
| Invite host canonical (`usepromi.app`) | PASS / FAIL |
| Accept invite + password setup | PASS / FAIL |
| Login + signed-in email visibility | PASS / FAIL |
| X connect/login | PASS / FAIL / N/A |
| Create/generate | PASS / FAIL |
| Schedule/upload | PASS / FAIL |
| History / Published lifecycle | PASS / FAIL |
| Owner isolation | PASS / FAIL |
| Sign-out + `/login` redirect | PASS / FAIL |
| Logged-out protected pages clean | PASS / FAIL |
| `/ops` non-operator blocked (`404`) | PASS / FAIL |
| Final tester result | PASS / PARTIAL / FAIL |
| Notes / bugs | |

Bug report minimum:
- screenshot
- time (with timezone)
- tester account email
- short repro steps

---

## 5) Known limitations (must be explicit)

- Invite-only beta only (no public signup)
- Real publish workflow currently focused on **X**
- Billing is **not** live paid launch
- Non-X real publish parity is partial
- Bugs must include screenshot/time/account email for triage

---

## 6) Operator execution runbook (real external tester)

1. Invite tester:
   - `npm run auth:user -- --action=invite --email=<tester-email> --confirm`
2. Confirm invite email delivered and canonical host is `https://usepromi.app`.
3. Ask tester to complete the core flow checklist (section 3).
4. Verify History / Published lifecycle for tester run.
5. Verify `/ops` remains blocked for tester (non-operator should see `404`).
6. Collect feedback using section 4 template.
7. Mark run result:
   - **PASS**: core flow complete, no blocker
   - **PARTIAL**: flow mostly works but blocker(s) or gaps remain
   - **FAIL**: critical blocker prevents core flow completion

---

## 7) Decision wording for this phase

- Phase 14.19 handoff prep materials: **READY**
- Real tiny invite-only external testers: **GO when testers are available**
- Broader expansion: **PARTIAL GO**
- Public/live paid launch: **not implied**

---

## Related docs

- `docs/PHASE14_18A_MULTI_ACCOUNT_SELF_TEST_EVIDENCE.md`
- `docs/PHASE14_15_CLOSED_BETA_READINESS.md`
- `docs/INTERNAL_BETA_RUNBOOK.md`
- `docs/INTERNAL_BETA_CHECKLIST.md`
- `docs/PHASE14_16_FIRST_TESTER_ROLLOUT.md`

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
| Date/time (UTC) | 2026-05-18 to 2026-05-19 (operator-run window) |
| Environment | Production canonical domain (`https://usepromi.app`) with operator-controlled invite accounts |
| Target URL | `https://usepromi.app` (canonical) |
| Commit SHA | (recorded in operator deployment notes) |
| Operator | Internal operator-controlled rehearsal |
| Approver | Internal |
| Planned self-test accounts | `3`-`5` |
| Completed self-test accounts | `3` |

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
| tlsghktks8.2@gmail.com | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Resolved during run: signed-in email visibility in Settings, sign-out/account-switch UX, sidebar/menu post-logout visibility, Drafts localStorage owner scoping, local Resend sender config, plan label mismatch until `NEXT_PUBLIC_PROMI_DEFAULT_PLAN=free` + redeploy | PASS |
| tlsghktks8.1@gmail.com | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Invite host corrected to canonical domain; invite token state rotated/revoked and reissued safely; token/secret mismatch risk clarified in operator notes | PASS |
| theory8@naver.com | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Final account run completed with expected Free-plan state and no blocking regressions | PASS |

### 2.1) Logout and isolation regression checks (manual)

- after sign-out, sidebar/menu hidden: PASS / FAIL
- logged-out protected pages do not show previous data: PASS / FAIL
- Drafts owner isolation verified: PASS / FAIL

Final rehearsal checks:

- after sign-out, sidebar/menu hidden: PASS
- logged-out protected pages do not show previous data: PASS
- Drafts owner isolation verified: PASS

### 2.2) Account result snapshot — `tlsghktks8.2@gmail.com`

- ownerId: `cmp6xp4kt0000kcsxkxvjthne`
- expected plan posture for this rehearsal account: `Free`
- result: PASS across invite/login/settings/X/create/schedule/history/isolation/logout checks
- `/ops` non-operator boundary: PASS (`404 / Not Found`)
- note: Settings plan display aligned with server entitlement after setting `NEXT_PUBLIC_PROMI_DEFAULT_PLAN=free` and redeploying

### 2.3) Final account snapshot — `theory8@naver.com`

- Invite email delivered: PASS
- Invite link host uses `https://usepromi.app`: PASS
- Accept-invite opened: PASS
- Password setup: PASS
- Login at `https://usepromi.app/login`: PASS
- Settings shows signed-in email: PASS
- Plan display matches expected Free state: PASS
- Owner isolation: PASS
- Drafts owner isolation: PASS
- X connect/login: PASS
- Create/generate: PASS
- Schedule/upload: PASS
- History display / Published lifecycle: PASS
- Sign out works and redirects to `/login`: PASS
- After sign-out, sidebar/menu hidden: PASS
- Logged-out protected pages do not show previous data: PASS
- `/ops` non-operator access returns `404 / Not Found`: PASS

---

## 3) Cohort-level self-test gate

Mark multi-account self-test **PASS** only if all are true:

- [x] At least **3 separate test accounts** complete core flow end-to-end.
- [x] No owner-isolation leak is found.
- [x] `/ops` remains protected from all non-operator test accounts.
- [x] Logout/sign-out works and redirects to `/login` for each tested account.
- [x] Switching accounts shows the correct signed-in email in Settings.
- [x] No critical schedule/publish failure remains unresolved.
- [x] Issues are documented with follow-up status.

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
| PH14-18A-SETTINGS-EMAIL | Medium | Settings did not clearly show signed-in email during account-switch rehearsal | tlsghktks8.2@gmail.com | Resolved | Internal | 14.18A |
| PH14-18A-LOGIN-PAGE | Medium | First-party `/login` UX was missing for clean account switching and stale-session avoidance | multi-account rehearsal | Resolved | Internal | 14.18A |
| PH14-18A-LOGOUT-UX | High | Sign-out control/account-switch UX was missing; stale-session confusion risk | tlsghktks8.2@gmail.com | Resolved | Internal | 14.18A |
| PH14-18A-SHELL-POST-LOGOUT | High | Sidebar/menu remained visible after sign-out and could surface stale view state | tlsghktks8.2@gmail.com | Resolved | Internal | 14.18A |
| PH14-18A-DRAFTS-OWNER-SCOPE | High | Drafts localStorage was not owner-scoped across switched accounts | tlsghktks8.2@gmail.com | Resolved | Internal | 14.18A |
| PH14-18A-MAIL-SENDER-LOCAL | Low | Local invite sender remained `resend.dev` until env correction | tlsghktks8.2@gmail.com | Resolved | Internal | 14.18A |
| PH14-18A-INVITE-HOST-LOCALHOST | High | Invite host initially resolved to localhost in local operator flow before canonical env correction | tlsghktks8.1@gmail.com | Resolved | Internal | 14.18A |
| PH14-18A-INVITE-TOKEN-STATE | High | Invite token acceptance failures required safe token rotation and operator `rotate-invite` command path | tlsghktks8.1@gmail.com | Resolved | Internal | 14.18A |
| PH14-18A-SECRET-MISMATCH-RISK | Medium | Token hash validation mismatch risk between issuance/runtime secrets documented for operators | tlsghktks8.1@gmail.com | Resolved | Internal | 14.18A |
| PH14-18A-PLAN-LABEL-FALLBACK | Medium | Settings plan label appeared Pro until `PROMI_DEFAULT_PLAN=free` and `NEXT_PUBLIC_PROMI_DEFAULT_PLAN=free` were set and redeployed | tlsghktks8.2@gmail.com | Resolved | Internal | 14.18A |

---

## 6) Decision

| Decision field | Value |
|---------------|-------|
| Multi-account self-test result | **PASS (operator-controlled 3-account rehearsal)** |
| Approver sign-off | Internal operator |
| Date/time (UTC) | 2026-05-19 |
| Notes / accepted risk | Operator-controlled multi-account rehearsal passed; this is not external cohort completion. Tiny invite-only external cohort remains GO when testers are available. Broader expansion remains PARTIAL GO. Public paid/live billing launch is not implied. |

---

## 7) Next-step note

Phase 14.18A operator-controlled 3-account self-test: **PASS**.  
Proceed to tiny invite-only real external testers when available; do **not** represent this artifact as external cohort completion.  
Broader expansion remains **PARTIAL GO** pending wider cohort/ops maturity evidence.

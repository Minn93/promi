# Promi internal beta release rehearsal

Use this document to execute and record a full internal-beta release candidate rehearsal.

## Scope

- Internal beta deployment only.
- No public SaaS launch assumptions.
- No real auth or real billing.

## Pre-rehearsal prerequisites

- `docs/INTERNAL_BETA_CHECKLIST.md` reviewed.
- `docs/INTERNAL_BETA_RUNBOOK.md` reviewed.
- CI workflow `Internal Beta Preflight` passing on candidate commit.
- Candidate commit/tag selected.

## Go/No-Go criteria

All **must pass** for Go:

1. Preflight passes:
   - `npm run check:internal-beta`
   - `npm run validate:owner-ids`
   - `npm run build`
2. Internal-beta production deployment boots and shows internal-beta banner.
3. Unsafe public mode safety block works (`PROMI_INTERNAL_BETA_MODE=0` in production).
4. Core workflow pass:
   - create/generate/edit works
   - save draft works
   - schedule post works
   - scheduled queue shows item
   - scheduler processes due item
   - history shows final result
5. X connect/reconnect works if X env is configured.
6. Upgrade pages clearly show simulated/internal-beta state.
7. Simulated billing actions are disabled in production.
8. No critical runtime/console errors in the core workflow.

If any required item fails, decision is **No-Go**.

## Rollback trigger thresholds

Trigger rollback immediately if any occurs after deployment:

- App fails to boot.
- Preflight fails in target environment.
- Scheduler cannot process due posts.
- OAuth connect/reconnect fails due app configuration.
- History does not record publish results.
- Internal-beta safety banner is missing.
- Public-mode safety block does not appear when expected.
- Simulated billing action is clickable in production.

## Rehearsal execution checklist

### A) Preflight evidence

- [ ] `npm run check:internal-beta` passed.
- [ ] `npm run validate:owner-ids` passed.
- [ ] `npm run build` passed.
- [ ] CI preflight workflow passed for candidate commit.

### B) Deploy evidence

- [ ] Deployment completed on target internal-beta environment.
- [ ] Internal-beta banner visible after first load.

### C) Core smoke evidence

- [ ] Create -> generate -> edit completed.
- [ ] Save draft completed.
- [ ] Connect/reconnect X completed (or marked N/A if X env not configured).
- [ ] Schedule post completed.
- [ ] Scheduled queue shows posted item.
- [ ] Scheduler job processed due item.
- [ ] History shows final publish/failed result.
- [ ] Upgrade pages show simulated/internal-beta state.
- [ ] Simulated billing actions disabled in production.
- [ ] Unsafe public mode safety block verified.

## Evidence capture template

Fill once per rehearsal.

```md
## Internal Beta Rehearsal Record

- Date/time (UTC): 
- Environment: 
- Candidate commit SHA: 
- Rehearsal owner: 

### Preflight
- check:internal-beta: PASS/FAIL
- validate:owner-ids: PASS/FAIL
- build: PASS/FAIL
- CI preflight workflow URL: 

### Smoke results
- Internal-beta banner visible: PASS/FAIL
- Create/generate/edit: PASS/FAIL
- Save draft: PASS/FAIL
- X connect/reconnect (if configured): PASS/FAIL/N/A
- Schedule post: PASS/FAIL
- Scheduled queue visible: PASS/FAIL
- Scheduler due job processing: PASS/FAIL
- History final result recorded: PASS/FAIL
- Upgrade pages simulated/internal-beta state: PASS/FAIL
- Simulated billing actions disabled in production: PASS/FAIL
- Unsafe public mode safety block: PASS/FAIL
- Critical console/runtime errors observed: YES/NO (details)

### Known issues
- 

### Decision
- GO / NO-GO
- Approver:
- Decision rationale:
- Rollback required: YES/NO
```

## Decision rule

- **GO** only if all required criteria pass and no critical errors are observed.
- **NO-GO** if any required criterion fails or any rollback trigger occurs.

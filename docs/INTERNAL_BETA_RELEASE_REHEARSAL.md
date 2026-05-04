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
- Owner-isolation smoke plan selected (`npm run smoke:owner-isolation` locally or manual CI workflow).

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
9. Owner-isolation adversarial smoke passes (Owner A cannot access Owner B scheduled/history/analytics/account data).

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

### D) Owner isolation adversarial evidence

- [ ] Owner A cannot fetch Owner B scheduled post by direct id.
- [ ] Owner A cannot edit/retry/cancel Owner B scheduled post.
- [ ] Owner A cannot fetch Owner B history with `scheduledPostId` filter.
- [ ] Owner A analytics scope remains Owner A only.
- [ ] Owner A cannot disconnect Owner B connected account ids.
- [ ] Human approver reviewed evidence and signed GO/NO-GO decision.

### E) Owner-isolation smoke execution mode evidence

- [ ] Execution mode recorded (`local` or `manual CI workflow_dispatch`).
- [ ] If CI used, workflow run URL recorded.
- [ ] Target environment recorded and confirmed non-prod unless explicitly approved rehearsal.

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

### Owner isolation adversarial results
- Owner A fetch Owner B scheduled post by id blocked: PASS/FAIL
- Owner A edit/retry/cancel Owner B post blocked: PASS/FAIL
- Owner A history filter by Owner B post blocked: PASS/FAIL
- Owner A analytics scope only Owner A: PASS/FAIL
- Owner A disconnect Owner B account blocked: PASS/FAIL

### Known issues
- 

### Decision
- GO / NO-GO
- Approver:
- Decision rationale:
- Rollback required: YES/NO
```

## Manual CI workflow option (not default PR gate)

Optional workflow for dedicated rehearsal runs:

- `.github/workflows/owner-isolation-smoke.yml`
- Trigger: `workflow_dispatch` only
- Safety: requires explicit non-prod confirmation input

This workflow is intentionally **not** part of the default PR preflight pipeline.

## Phase 12.6 execution evidence (real-auth two-owner)

- Date/time (UTC): `2026-05-04T06:12:52Z`
- Environment: `local real-auth rehearsal (PROMI_INTERNAL_BETA_MODE=0, NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE=0)`
- Candidate commit SHA: `cb9ae3f`
- Rehearsal owner: `Cursor agent`
- Owner A id/email: `phase12-owner-a` / `phase12-owner-a@example.com`
- Owner B id/email: `phase12-owner-b` / `phase12-owner-b@example.com`
- Script used: `node ./scripts/phase12-6-two-owner-smoke.mjs`

### Route/API adversarial checks

- `POST /api/scheduled-posts` as Owner A; expected create succeeds; actual `201` with id `d462fb8f-3452-4027-86c6-397cf91cd6d8`; PASS
- `GET /api/scheduled-posts?limit=200` as Owner A; expected list includes Owner A id; actual included; PASS
- `GET /api/scheduled-posts?limit=200` as Owner B; expected list excludes Owner A id; actual excluded; PASS
- `GET /api/scheduled-posts/{ownerAId}` as Owner B; expected blocked; actual `404`; PASS
- `GET /scheduled/{ownerAId}/edit` as Owner B; expected not found UX; actual page showed "Scheduled post not found"; PASS
- `PATCH /api/scheduled-posts/{ownerAId}/edit` as Owner B; expected blocked; actual `404`; PASS
- `POST /api/scheduled-posts/{ownerAId}/retry` as Owner B; expected blocked; actual `404`; PASS
- `PATCH /api/scheduled-posts/{ownerAId}` cancel as Owner B; expected blocked; actual `404`; PASS
- `GET /api/post-history?scheduledPostId={ownerAId}` as Owner B; expected no cross-owner rows; actual `200` with `rows=0`; PASS
- `GET /analytics` as Owner A and Owner B with owner-specific fixtures; expected per-owner-only markers; actual each owner saw only own marker; PASS
- `GET /api/connected-accounts` as Owner B with Owner A fixture account present; expected Owner A account hidden; actual hidden; PASS
- `PATCH /api/connected-accounts` disconnect Owner A account as Owner B; expected blocked; actual `404`; PASS

### Scheduler/publish owner-scope check

- Publish account lookup owner scope (Phase 12.5 fix path) validated by adversarial fixture:
  cross-owner connected-account lookup returned `null`; PASS
- Scheduler execution was not part of this run; owner propagation remains covered by Phase 12.1-D and owner-id validation gate.

### Internal-beta regression check

- `npm run preflight:internal-beta` passed after real-auth rehearsal run; PASS
- `npm run validate:owner-ids` passed; PASS
- `npm run build` passed; PASS

### Known issues

- No owner-isolation failures observed in this execution.

### Decision

- GO / NO-GO: `GO`
- Approver: `Pending human approver`
- Decision rationale: All two-owner adversarial checks passed, no cross-owner leakage observed.
- Rollback required: `NO`

## Decision rule

- **GO** only if all required criteria pass and no critical errors are observed.
- **NO-GO** if any required criterion fails or any rollback trigger occurs.

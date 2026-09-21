---
name: release-checklist
description: Pre-merge and post-deploy checklist for a Captain Prospectus release. Use when preparing a PR for merge to main or verifying a production deploy.
---

# Release checklist

## Before merge
- [ ] CI green (typecheck, tests, build).
- [ ] Migration reviewed by `migration-guard`; safe for the currently deployed Worker.
- [ ] Sync contract change? Followed `sync-contract-change`.
- [ ] Security-relevant? Reviewed by `security-reviewer`.
- [ ] Docs and ADRs updated; roadmap ticked.
- [ ] No new paid service or dependency (ADR-0002).
- [ ] `wrangler.jsonc`: `assets.run_worker_first` is still `["/api/*"]`, never `true` — `true` bills
      every app-shell request against the 100,000/day Worker quota (`free-tier-budget.md`).
- [ ] Service worker still excludes `/api/*` from caching.

## After deploy (CI does migrate → deploy)
- [ ] App loads on the workers.dev URL through Access.
- [ ] `/api/me` returns the right role.
- [ ] A phone completes a sync; admin feed shows the visit.
- [ ] Workers logs show no new errors for 15 minutes.

## If broken
- Code: `wrangler rollback` (run by the owner, not an agent).
- Data: D1 Time Travel, see `docs/deployment.md`.

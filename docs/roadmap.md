# Roadmap

Each milestone ends deployable.

## M0 — Foundations
- [x] Docs, ADRs, rules, agents, skills
- [x] Project scaffold (Vite + Worker + D1 + Dexie), lint/typecheck/test/build green
- [x] Schema and first migration, `/api/me`, `/api/agent/sync`, local seed
- [ ] GitHub repo, branch protection on `main`
- [ ] Cloudflare account, D1 database, Access application
- [ ] First deploy behind Access

## M1 — Prospects & CSV import
- [x] Schema + first migration
- [x] Auth middleware (Access JWT), `/api/me`
- [ ] Admin: CSV import with column mapping and preview
- [ ] Admin: prospect list, assign (single + bulk)

## M2 — Field PWA
- [x] Offline outbox + sync engine and endpoint (screens still to build)
- [ ] Installable PWA, app shell offline
- [ ] Today list ordered by distance
- [ ] Visit form (flyer, outcome, follow-up, notes)
- [ ] Add field prospect

## M3 — Scripts
- [ ] Script editor (admin), versioning
- [ ] Script questions in the visit form, validation

## M4 — Map import & live feed
- [ ] Leaflet polygon drawing, Overpass proxy + cache
- [ ] Live visits feed for admin

## M5 — Hardening
- [ ] Security review against [security.md](security.md)
- [ ] Orphan visits: report ids the server could not store in a `rejected` field so a phone stops resending for ever (see [field-operations](domains/field-operations.md#rules))
- [x] Scheduled D1 export backup (`.github/workflows/backup.yml`; inert until the Cloudflare secrets exist)
- [ ] CSV export of prospects and visits
- [ ] Manual prospect merge (dedupe misses)

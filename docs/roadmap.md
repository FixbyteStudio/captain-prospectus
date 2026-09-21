# Roadmap

Each milestone ends deployable.

## M0 — Foundations
- [x] Docs, ADRs, rules, agents, skills
- [ ] GitHub repo, branch protection on `main`
- [ ] Cloudflare account, D1 database, Access application
- [ ] Project scaffold (Vite + Worker + D1), CI green, first deploy of an empty app behind Access

## M1 — Prospects & CSV import
- [ ] Schema + first migration
- [ ] Auth middleware (Access JWT), `/api/me`
- [ ] Admin: CSV import with column mapping and preview
- [ ] Admin: prospect list, assign (single + bulk)

## M2 — Field PWA
- [ ] Installable PWA, app shell offline
- [ ] Today list ordered by distance
- [ ] Visit form (flyer, outcome, follow-up, notes)
- [ ] Offline outbox + sync endpoint
- [ ] Add field prospect

## M3 — Scripts
- [ ] Script editor (admin), versioning
- [ ] Script questions in the visit form, validation

## M4 — Map import & live feed
- [ ] Leaflet polygon drawing, Overpass proxy + cache
- [ ] Live visits feed for admin

## M5 — Hardening
- [ ] Security review against [security.md](security.md)
- [ ] Scheduled D1 export backup
- [ ] CSV export of prospects and visits
- [ ] Manual prospect merge (dedupe misses)

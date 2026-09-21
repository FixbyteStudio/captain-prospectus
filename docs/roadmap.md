# Roadmap

Each milestone ends **verified in local dev**: `npm run dev` against a seeded
local D1, with lint, typecheck, tests and build green. Cloudflare setup and the
first deploy are deliberately last (M6) — the app is built and reviewed the way
any app is, and only meets production once it is worth deploying.

## M0 — Foundations ✅
- [x] Docs, ADRs, rules, agents, skills
- [x] Project scaffold (Vite + Worker + D1 + Dexie), lint/typecheck/test/build green
- [x] Schema and first migration, `/api/me`, `/api/agent/sync`, local seed
- [x] CI runs on every push and pull request

## M1 — Prospects & CSV import
- [x] Schema + first migration
- [x] Auth middleware (Access JWT), `/api/me`
- [ ] `POST /api/admin/prospects/batch` — upsert by dedupe key (250 rows/request)
- [ ] `GET /api/admin/prospects` — list with status / assignedTo / source filters
- [ ] `PATCH /api/admin/prospects/:id`, `POST /api/admin/prospects/assign`
- [ ] Admin: CSV import with column mapping and preview (parsed in the browser)
- [ ] Admin: prospect list, assign (single + bulk)

## M2 — Field PWA
- [x] Offline outbox + sync engine and endpoint
- [ ] Installable PWA, app shell offline
- [ ] Today list ordered by distance (`orderByNearestNext`)
- [ ] Visit form (flyer, outcome, follow-up, notes) writing to the outbox
- [ ] Add field prospect
- [ ] Sync triggers wired: app start, `online`, after each visit, every 60 s

## M3 — Scripts
- [ ] Script editor (admin), versioning
- [ ] Script questions in the visit form, validation

## M4 — Map import & live feed
- [ ] Leaflet polygon drawing, Overpass proxy + cache
- [ ] Live visits feed for admin

## M5 — Hardening
- [ ] Security review against [security.md](security.md)
- [ ] Orphan visits: report ids the server could not store in a `rejected` field so a phone stops resending for ever (see [field-operations](domains/field-operations.md#rules))
- [ ] Data retention decided and written down (visit notes, agent positions)
- [ ] CSV export of prospects and visits
- [ ] Manual prospect merge (dedupe misses)

## M6 — Go live
Everything here is account setup, done once, by hand. Runbook:
[deployment.md](deployment.md).

- [ ] Branch protection on `main` (require CI, one review, squash-merge)
- [ ] `wrangler d1 create captain-prospectus`, paste `database_id` into `wrangler.jsonc`
- [ ] Enable Cloudflare Access on the Worker; set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAILS`
- [ ] GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- [ ] Re-enable the `workflow_run` trigger in `.github/workflows/deploy.yml` and the schedule in `backup.yml`
- [ ] First deploy; verify Access login, `/api/me`, and that `curl` with no cookie gets 401
- [ ] Agents install the PWA from the phone browser

# Roadmap

Each milestone ends **verified in local dev**: `pnpm dev` against a seeded
local D1, with lint, typecheck, tests and build green. Cloudflare setup and the
first deploy are deliberately last (M6) — the app is built and reviewed the way
any app is, and only meets production once it is worth deploying.

**Every UI item below follows the same rule** ([ADR-0014](adr/0014-tailwind-and-shadcn-ui.md)):
run the `frontend-design` skill to decide the screen's design *before* building
it, and compose it from **shadcn/ui** elements vendored into `src/client/ui/`.
Do not hand-roll an element shadcn provides, and replace every English string a
vendored component ships with the French one from `src/client/copy.ts`.

## M0 — Foundations ✅
- [x] Docs, ADRs, rules, agents, skills
- [x] Project scaffold (Vite + Worker + D1 + Dexie), lint/typecheck/test/build green
- [x] Schema and first migration, `/api/me`, `/api/agent/sync`, local seed
- [x] CI runs on every push and pull request

## M1 — Prospects & CSV import
- [x] Schema + first migration
- [x] Auth middleware (Access JWT), `/api/me`
- [x] **UI foundation**: Tailwind v4 via `@tailwindcss/vite`, `shadcn init`, design
      tokens moved from `tokens.css` into `@theme`, `app.css` migrated (ADR-0014)
- [x] **Design pass** with the `frontend-design` skill: app shell, the prospect
      table and the import flow, decided before any of them is built —
      written up in [design.md](design.md)
- [x] `POST /api/admin/prospects/batch` — upsert by dedupe key (250 rows/request)
- [x] `GET /api/admin/prospects` — list with status / assignedTo / source filters
- [x] `PATCH /api/admin/prospects/:id`, `POST /api/admin/prospects/assign`, `GET /api/admin/agents`
- [ ] Admin: CSV import with column mapping and preview (parsed in the browser) — shadcn `table`, `select`, `dialog`
- [ ] Admin: prospect list, assign (single + bulk) — shadcn `data-table`, `checkbox`, `dropdown-menu`

## M2 — Field PWA
- [x] Offline outbox + sync engine and endpoint
- [ ] **Design pass** with the `frontend-design` skill: the field screens are a
      separate problem from the admin ones — one thumb, outdoors, in a hurry.
      Keep the 48px minimum touch target in the shadcn variants, not per screen
- [ ] Installable PWA, app shell offline
- [ ] Today list ordered by distance (`orderByNearestNext`)
- [ ] Visit form (flyer, outcome, follow-up, notes) writing to the outbox — shadcn `form`, `radio-group`, `calendar`, `textarea`
- [ ] Add field prospect — shadcn `form`, `select`
- [ ] Sync triggers wired: app start, `online`, after each visit, every 60 s, with a shadcn `sonner` toast on failure
- [ ] Measure the field route's JS bundle against the ADR-0014 budget note

## M3 — Scripts
- [ ] **Design pass** with the `frontend-design` skill: the question editor is the
      most complex screen in the app
- [ ] Script editor (admin), versioning — shadcn `form`, `accordion`, `select`, drag to reorder
- [ ] Script questions in the visit form, validation — one shadcn control per question type

## M4 — Map import & live feed
- [ ] **Design pass** with the `frontend-design` skill: map + results side by side,
      and the live feed
- [ ] Leaflet polygon drawing, Overpass proxy + cache — Leaflet owns the map canvas; every control around it is shadcn
- [ ] Live visits feed for admin — shadcn `card`, `badge`, `scroll-area`

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

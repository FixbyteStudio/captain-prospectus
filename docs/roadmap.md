# Roadmap

Each milestone ends **verified in local dev**: `pnpm dev` against a seeded
local D1, with lint, typecheck, tests and build green. Cloudflare setup and the
first deploy are deliberately last (M6) — the app is built and reviewed the way
any app is, and only meets production once it is worth deploying.

**Every UI item below follows the same rule** ([ADR-0014](adr/0014-tailwind-and-shadcn-ui.md)):
run the `frontend-design` skill to decide the screen's design *before* building
it, and compose it from **shadcn/ui** elements vendored into `src/client/ui/`.
Do not hand-roll an element shadcn provides, and replace every English string a
vendored component ships with the French one from `src/client/copy.ts`. **On
the field route**, [ADR-0015](adr/0015-native-controls-on-the-field-route.md)
narrows this: a native element replaces a shadcn one whose dependencies breach
the bundle budget, cited against a measurement each time.

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
- [x] Admin: CSV import with column mapping and preview (parsed in the browser) — shadcn
      `table`, `select`, `dialog`, `progress`, `alert`
- [x] Admin: prospect list, assign (single + bulk) — composed over shadcn `table`,
      `checkbox`, `dropdown-menu`, `select`. Not the `data-table` recipe: that needs
      @tanstack/react-table, and this screen filters and sorts server-side

## M2 — Field PWA
- [x] Offline outbox + sync engine and endpoint — wired to the app; `runSync` was
      dead code until this milestone (see the bundle note below)
- [x] **Design pass** with the `frontend-design` skill: the field screens are a
      separate problem from the admin ones — one thumb, outdoors, in a hurry.
      Keep the 48px minimum touch target in the shadcn variants, not per screen
      — written up in [design.md](design.md#the-field-side)
- [x] Installable PWA, app shell offline — service worker registered
      (`registerType: "prompt"`, an owned update banner), identity falls back to
      a cached copy so the shell itself never blocks on the network
- [x] Today list ordered by distance (`orderByNearestNext`) — plus unsynced field
      prospects shown alongside the pulled list, and a "Plus tard" group for
      follow-ups not yet due
- [x] Visit form (flyer, outcome, follow-up, notes) writing to the outbox —
      radio-group + textarea + `<input type="date">`, not shadcn `form`/`calendar`
      ([ADR-0015](adr/0015-native-controls-on-the-field-route.md))
- [x] Add field prospect — radio-group, not shadcn `form`/`select` (ADR-0015)
- [x] Sync triggers wired: app start, `online`, after each visit, every 60 s —
      an ambient sync strip in the band, not a `sonner` toast: a pending count
      is a standing fact for hours, not a four-second event (design.md)
- [x] Measure the field route's JS bundle against the ADR-0014 budget note — the admin
      side is a lazy chunk, the budget is in [vision.md](vision.md); re-measured at the
      end of M2: **158 kB, over the 150 kB budget** — `zod` becoming reachable for the
      first time once the sync engine is actually wired, tracked as
      [backlog/004](backlog/004-field-bundle-budget.md) and settled at the start of M3 by
      [ADR-0017](adr/0017-zod-mini-for-the-shared-wire-contract.md): **141.95 kB, under budget**

## M3 — Scripts
- [x] Field bundle back under budget before the milestone spends anything —
      [ADR-0017](adr/0017-zod-mini-for-the-shared-wire-contract.md), closing
      [backlog/004](backlog/004-field-bundle-budget.md)
- [x] **Design pass** with the `frontend-design` skill: the question editor is the
      most complex screen in the app — written up in
      [design.md](design.md#the-script-editor)
- [x] `GET` / `POST /api/admin/scripts` — versioning server-side, "exactly one active script"
      enforced by a partial unique index rather than by the route alone
- [x] Script editor (admin), versioning — shadcn `form` + `select`, `@dnd-kit` drag-and-keyboard
      reorder over a bordered ledger list rather than `accordion` (design.md: no cards, dense
      rows), a confirmation dialog before a save that activates a new version, and a lock on a
      question's `key` once it has been saved
- [x] Script questions in the visit form, validation — a second step after the outcome
      (design.md), one control per question type from `field-controls.tsx` rather than shadcn,
      since ADR-0015's native-controls rule still governs this route

## M4 — Map import & live feed
- [x] **Design pass** with the `frontend-design` skill: map + results side by side,
      and the live feed — written up in [design.md](design.md#the-map-import) and
      [design.md](design.md#the-live-feed)
- [x] Leaflet polygon drawing, Overpass proxy + cache — Leaflet owns the map canvas; every control
      around it is shadcn. Drawing is hand-rolled over `L.Polygon` + `L.CircleMarker` rather than a
      draw plugin (~60 kB gzipped for a toolbar we would restyle and translate); the cache is keyed
      on the polygon rounded to 5 dp, so redrawing does not cost Overpass another query
- [x] Live visits feed for admin — a **ledger**, not the `card` + `badge` +
      `scroll-area` this line used to ask for: cards around rows and status as a
      coloured pill are both on design.md's "Not this" list, and the design pass
      resolved the contradiction in that file's favour (design.md#the-live-feed)
- [x] Precached the field app only before adding Leaflet to the admin chunk
      ([ADR-0019](adr/0019-admin-chunk-out-of-the-precache.md)) — the precache total had drifted to
      893.57 KiB, a third of it an app a phone cannot open. **Measured at the end of M4: entry chunk
      143.93 kB against the 150 kB budget, precache 604.59 KiB across 14 entries.** None of
      Leaflet's 45.7 kB reaches a phone

## M5 — Hardening
- [ ] Security review against [security.md](security.md)
- [ ] Orphan visits: report ids the server could not store in a `rejected` field so a phone stops resending for ever (see [field-operations](domains/field-operations.md#rules))
- [ ] Data retention decided and written down (visit notes, agent positions)
- [ ] CSV export of prospects and visits
- [x] Manual prospect merge (dedupe misses) — see [prospecting](domains/prospecting.md#merging)

## M6 — Go live
Everything here is account setup, done once, by hand. Runbook:
[deployment.md](deployment.md).

- [ ] Branch protection on `main` (require CI, one review, squash-merge) — needed earlier than M6
      if the night shift runs, see [ADR-0016](adr/0016-autonomous-overnight-agent-runs.md)
- [ ] `wrangler d1 create captain-prospectus`, paste `database_id` into `wrangler.jsonc`
- [ ] Enable Cloudflare Access on the Worker; set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAILS`
- [ ] GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- [ ] Re-enable the `workflow_run` trigger in `.github/workflows/deploy.yml` and the schedule in `backup.yml`
- [ ] First deploy; verify Access login, `/api/me`, and that `curl` with no cookie gets 401
- [ ] Agents install the PWA from the phone browser

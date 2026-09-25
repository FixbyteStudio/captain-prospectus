# Roadmap

Each milestone ends **verified in local dev**: `pnpm dev` against a seeded
local D1, with lint, typecheck, tests and build green. Cloudflare setup and the
first deploy are deliberately last (M6) — the app is built and reviewed the way
any app is, and only meets production once it is worth deploying.

**Every UI item below follows the same rule** ([ADR-0014](adr/0014-tailwind-and-shadcn-ui.md)):
decide the screen's design against [design.md](design.md) *before* building
it, and compose it from **shadcn/ui** elements vendored into `src/client/ui/`.
Do not hand-roll an element shadcn provides, and replace every English string a
vendored component ships with the French one from `src/client/copy.ts`. **On
the field route**, the date input, radios, checkboxes and labels stay native
([ADR-0015](adr/0015-native-controls-on-the-field-route.md),
[ADR-0026](adr/0026-budget-the-field-precache-not-the-entry-chunk.md)), and the
route's precache stays under the 1,000 KiB ceiling.

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
- [x] **Design pass**: app shell, the prospect
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
- [x] **Design pass**: the field screens are a
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
- [x] **Design pass**: the question editor is the
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
- [x] **Design pass**: map + results side by side,
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

### After M4 — a second map provider
- [x] Google Places beside Overpass, chosen from a dropdown on the map step
      ([ADR-0020](adr/0020-google-places-as-a-second-map-provider.md)) — OSM coverage in the target
      city turned out to be exactly as patchy as ADR-0008 predicted, and the owner has accepted
      the cost and the licence terms. Overpass stays the default and keeps the polygon; Google
      draws a circle because Nearby Search has no polygon search, and returns at most 20 places
      because it has no page tokens either. The field mask stays inside the Pro tier, so phone
      and website do not come from Google. **Entry chunk 144.38 kB against the 150 kB budget,
      precache 605.78 KiB across 14 entries** — the +0.45 kB is French copy and constants in the
      bundle the field shares, and nothing of the provider itself reaches a phone

## M5 — Hardening
- [x] Security review against [security.md](security.md) — all nine threat-model rows
      checked against the code, and the table now records which ones the code does not
      honour rather than claiming all of them. Two were fixed here: there was **no body
      size cap anywhere** (#8) and `POST /api/dev/seed` cast its body instead of
      validating it (#9). The cap is `MAX_REQUEST_BYTES`, 2 MiB, enforced Worker-wide as
      the first middleware registered — above the `/dev` mount, because Hono composes
      handlers in registration order and that is the one route mounted before auth. The
      dev route now needs `DEV_USER_EMAIL` as well as a localhost host. The field client
      trims a batch that would exceed the cap: a payload the server always refuses is an
      outbox that never drains (INVARIANT 5). **Entry chunk 144.51 kB against the 150 kB
      budget, precache 606.09 KiB across 14 entries.**

      Filed, not fixed here — the review's real yield:
      **[#33](https://github.com/FixbyteStudio/captain-prospectus/issues/33) is the one to do next**: agent sync checks that a visit's prospect
      *exists*, never that it is assigned to the caller, so either agent can write a visit
      onto any prospect and flip its status. It wants the same ADR as the orphan-visits
      item below, because a correct fix has to say what happens to the refused visit.
      Then [#30](https://github.com/FixbyteStudio/captain-prospectus/issues/30) (a sync touching >100 distinct prospects breaches D1's
      bound-parameter limit and strands the outbox — a real phone can hit it),
      [#34](https://github.com/FixbyteStudio/captain-prospectus/issues/34) (the backup workflow ships the whole database to a GitHub artifact,
      which contradicts this doc and is really a retention decision),
      [#35](https://github.com/FixbyteStudio/captain-prospectus/issues/35), [#36](https://github.com/FixbyteStudio/captain-prospectus/issues/36), [#37](https://github.com/FixbyteStudio/captain-prospectus/issues/37), [#38](https://github.com/FixbyteStudio/captain-prospectus/issues/38), [#31](https://github.com/FixbyteStudio/captain-prospectus/issues/31),
      [#32](https://github.com/FixbyteStudio/captain-prospectus/issues/32), and [backlog/005](backlog/005-outbox-identity-stamp.md), which stays
      a task of its own because it needs a Dexie migration
- [x] Orphan visits — solved as a **quarantine**, not the `rejected` field this line used to
      ask for ([ADR-0022](adr/0022-quarantine-visits-the-server-cannot-take.md)). A
      `rejected` array would have destroyed a visit on the phone with no copy anywhere,
      which is the exact failure INVARIANT 5 exists to prevent. Instead a visit the server
      cannot take — unknown prospect, **or a prospect not assigned to the sender**, which
      folded #33 into the same mechanism — is stored in `visits_orphaned` and reported in
      `accepted`, so the outbox drains and nothing is lost. The admin repairs or discards
      it from « À rattacher » ([design.md](design.md#the-repair-queue)). **Entry chunk
      145.01 kB against the 150 kB budget, precache 607.93 KiB** — the +0.41 kB is French
      copy the field route ships but never renders, which is
      [#20](https://github.com/FixbyteStudio/captain-prospectus/issues/20)
- [x] Data retention decided and written down —
      [ADR-0023](adr/0023-retention-by-redaction.md). A visit is kept **for ever**; its
      `lat`, `lng` and `notes` are nulled after 90 days by a daily Cron Trigger, measured
      on `received_at` because a phone's clock can be wrong. Deleting the row instead
      would have destroyed business history and broken the `last_visit_at` ADR-0011
      derives. This is the **first and only exception** to `visits` being append-only, and
      the rule now says so in the d1-migration skill, `schema.ts` and
      [data-model.md](data-model.md). Backups move to R2, closing
      [#34](https://github.com/FixbyteStudio/captain-prospectus/issues/34) — the bucket and
      the token scope are one-time setup in [deployment.md](deployment.md)
- [x] CSV export of prospects and visits — [backlog/001](backlog/001-prospect-csv-export.md)
      and [002](backlog/002-visit-csv-export.md). One serialiser in `src/shared/csv.ts`,
      unit-tested away from D1, and two admin routes. Timestamps go out as ISO-8601
      because a spreadsheet shows epoch ms as a 13-digit number; the visits range reads
      `received_at`, not `visited_at`, so a phone that syncs days late is not silently
      dropped (INVARIANT 12). **No download button** — that needs a design pass, so the
      endpoints ship first and add no French copy
- [x] Manual prospect merge (dedupe misses) — see [prospecting](domains/prospecting.md#merging)
- [x] Sync's own lookups chunked, closing
      [#30](https://github.com/FixbyteStudio/captain-prospectus/issues/30). The route
      chunked its inserts but not the three `inArray` selects beside them, so a batch
      naming more than 100 distinct prospects — a week offline is enough — bound over
      D1's 100 parameters and 500d. The 500 correctly kept the outbox, so the phone
      rebuilt the same payload for ever (INVARIANT 5). A test syncing 150 distinct
      prospects fails without the fix

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

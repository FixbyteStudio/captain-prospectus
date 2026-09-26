---
id: 012
status: ready
implements: docs/data-model.md (overpass_cache "has no eviction path yet (issue #25)"), ADR-0008, ADR-0020, ADR-0023 (the daily cron this reuses)
depends_on: []
---

# Evict expired map-provider cache rows in the daily sweep

## Goal

`overpass_cache` stops growing without bound. The daily scheduled run that
already does the retention sweep (ADR-0023) also deletes cache rows older than
the longest provider TTL, a bounded batch per run.

## Why this is ready, not needs-decision

The issue weighed three options. The expensive ones needed new surface: a new
Cron Trigger, a `wrangler.jsonc` change, or a `created_at` index (a migration).
None is needed now:

- **Cron:** `wrangler.jsonc` already has `"triggers": { "crons": ["40 3 * * *"] }`,
  and `scheduled()` in `src/worker/index.ts` already runs once a day for
  `runRetention`. This adds a second step to that same run.
- **Migration:** none. The table holds one row per distinct polygon or circle
  searched, which means dozens to low hundreds of rows. A full scan on
  `created_at` once a day reads that many rows, far inside D1's free tier
  (`docs/free-tier-budget.md`). An index would cost a migration to save nothing
  measurable.
- **ADR:** none (ADR-0024). A cache row is a copy of a provider's answer that
  the next miss fetches again. Deleting one loses no business data and is
  reversed by searching the same shape again.

It is also a compliance fix, not only tidiness. `PLACES_CACHE_TTL_MS`'s comment
(`src/shared/constants.ts`) records that Google's terms cap caching Places
content at 30 days. Today a Google row is ignored after 7 days but kept forever.

## Acceptance criteria

- [ ] A function `evictMapCache(db: Db, now: number): Promise<{ evicted: number; cutoff: number }>`,
      in `src/worker/retention.ts` beside `runRetention`, or in a new
      `src/worker/map-cache.ts`, whichever reads better. It deletes
      `overpass_cache` rows whose `created_at` is older than
      `now - Math.max(OVERPASS_CACHE_TTL_MS, PLACES_CACHE_TTL_MS)`. The table
      holds both providers' rows (ADR-0020), so the cutoff must never be shorter
      than either provider's TTL. A row a reader would still accept as fresh is
      never deleted.
- [ ] Bounded per run like the retention sweep: at most a named constant, e.g.
      `MAP_CACHE_EVICT_BATCH` in `src/shared/constants.ts` with a one-line why.
      Select the `hash`es first with `.limit(...)`, then delete them in
      `chunk(ids, D1_MAX_BOUND_PARAMS)` batches (INVARIANT 7). SQLite has no
      `DELETE … LIMIT` by default, which is why `runRetention` selects first too.
- [ ] `scheduled()` in `src/worker/index.ts` runs it after `runRetention`, in its
      own `try`/`catch`, so a failed eviction never stops the redaction sweep and
      a failed sweep never stops eviction. It logs one line in the style of
      `describeSweep`, e.g.
      `map cache: evicted N row(s) created before <ISO date>`, with no hash, body
      or coordinates in it.
- [ ] Tests (worker project, in `src/worker/retention.test.ts` or a new
      `src/worker/map-cache.test.ts`):
      - a row older than the cutoff is deleted, a row just inside it is kept;
      - the returned `cutoff` equals
        `now - Math.max(OVERPASS_CACHE_TTL_MS, PLACES_CACHE_TTL_MS)`, computed in
        the test from the imported constants, so a later change to either TTL
        keeps the test honest;
      - a second run the same day evicts 0 (idempotent);
      - more expired rows than the batch: one run evicts exactly the batch, the
        next evicts the rest;
      - the existing "the scheduled handler" tests still pass, plus one asserting
        a throwing eviction does not reject `scheduled()` and does not stop
        `runRetention`'s log line.
- [ ] No change to `wrangler.jsonc`, `drizzle/`, `src/worker/db/schema.ts` or
      `src/worker/routes/admin.ts`. `git diff main --stat` shows none of them.
- [ ] Docs updated:
      - `docs/data-model.md`: replace "It has no eviction path yet (issue #25); a
        second writer makes that slightly more pressing." with one sentence saying
        the daily sweep deletes rows past the longer provider TTL;
      - `docs/free-tier-budget.md#cron-triggers-and-r2-adr-0023`: one line saying
        the same daily run also evicts expired map-cache rows, bounded to the new
        constant.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

## Out of scope

- Eviction on a cache miss in the import handlers. That would mean editing
  `src/worker/routes/admin.ts`, which is epic 2's lane this week, and it only
  tidies keys that are searched again.
- An index on `overpass_cache.created_at`, or any migration.
- Changing either TTL, or shortening the Places TTL to track Google's terms more
  tightly. The 7-day TTL is already under the 30-day cap.
- A new cron schedule. The existing `40 3 * * *` run is the only trigger.
- Changing `runRetention`'s behaviour or its log line.

## Notes

- If the implementer finds a reason this does need a migration, a wrangler change
  or a new ADR, that is a blocker (night-shift skill, step 8). Open the draft PR
  with options; do not add one.
- `OVERPASS_CACHE_TTL_MS` and `PLACES_CACHE_TTL_MS` are both in
  `src/shared/constants.ts`. Import them; do not restate 7 days.
- Commit: `feat(ingestion): evict expired map-cache rows in the daily sweep`.
- Closes #25

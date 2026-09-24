# Free-tier budget

Limits change. **Re-verify on the vendors' pricing pages before relying on them**, and update the "checked" date.

| Service | Free limit (as understood) | Our expected usage | Headroom |
|---|---|---|---|
| Workers requests | 100,000 / day | ~2 agents × ~200 syncs + admin polling ~2,000 ≈ 3,000 / day | ~30× |
| Worker CPU per request | **10 ms** (hard limit, free plan) | a sync is a few ms; see watch-outs | thin — measure |
| Static asset requests | free and unlimited, *if the Worker is not invoked for them* | the whole PWA shell | n/a |
| D1 storage | 5 GB | < 50 MB in year one | large |
| D1 rows read | 5 M / day (**enforced**: queries fail past it) | low tens of thousands | large |
| D1 rows written | 100 k / day (**enforced**) | imports up to a few thousand; visits ~100 | large |
| Cloudflare Access | Free Zero Trust plan, seat-capped | 3–4 users | large |
| Overpass API | Public, fair-use | a few queries per week, cached 7 days | fine if cached |
| Google Places — Nearby Search **Pro** | Per-SKU monthly free call count; Google retired the universal $200 credit in March 2025 | one call per map search, cached 7 days; a few dozen a month | **verify in the Cloud console** |
| OSM tiles | Public, fair-use, attribution required | light admin use | fine |
| GitHub Actions | Free minutes for private repos | a few minutes per PR | fine |

Checked: 2026-09-22 (from public sources, to be confirmed on official pricing pages).

## Watch-outs

- **Google Places is the one line here that can actually bill us** (ADR-0020), and the only
  one whose free allowance this file does not state a number for. Per-SKU allowances changed
  in March 2025 and the figures in circulation disagree; the authoritative number is in the
  owner's own Cloud console, under the *Nearby Search Pro* SKU. Read it there before relying
  on headroom.
- **The field mask decides which SKU is billed.** `places.nationalPhoneNumber`,
  `places.internationalPhoneNumber` and `places.websiteUri` are Enterprise-tier on Nearby
  Search; adding one moves every search — including ones that find nothing — onto a smaller
  allowance at a higher price, and nothing in the response would say so. `places.test.ts`
  fails if the mask grows to include them.
- **A cache miss on the Google provider is a charge.** The 7-day TTL is not etiquette there,
  it is the bill; coordinates are rounded to 5 decimals before hashing so a nudged pin is not
  a second search.

- A bug that loops syncs could burn request quota: the client backs off exponentially on errors.
- Row reads count scanned rows: keep the indexes in [data-model.md](data-model.md) and avoid unindexed filters.
  One known exception: the likely-duplicate check on every map search filters `prospects` on a bounding box,
  and there is no index on `lat`/`lng`, so each search scans the whole table. At 3,000 prospects and 30
  searches a day that is 90 k rows, about 2 % of the daily limit. An index on `lat` is the fix if it ever
  is not.
- **The sidebar's badges run the duplicate sweep on every admin page, not just Doublons** (GH #63):
  `AdminSidebar` calls the same `useDuplicates()` the screen does, to keep its count identical. The sweep
  reads ≤ 5,000 rows; at 3,000 prospects and about 20 admin loads a day that is roughly 60 k rows, 1.2 % of
  the daily limit. `useOrphans()` runs the same way and also refetches on every tab focus
  (`refetchOnWindowFocus: true`, no `staleTime`); a non-empty queue additionally scans up to
  `DUPLICATES_SCAN_LIMIT` live prospects for repair candidates, so a busy admin tab with visits waiting to be
  rattached reads meaningfully more than the healthy empty-queue case, which costs only a `count(*)`.
- **CPU, not wall time, is the binding limit.** Waiting on D1 or Overpass is free; `JSON.parse`,
  zod validation, dedupe-key normalisation and crypto are not. This is why the CSV batch is capped
  at 250 rows per request ([ingestion](domains/ingestion.md)) and why the Access JWKS is cached in
  module scope rather than refetched per request.
- **D1 free-tier limits are hard-enforced since 2026-09-01.** Past the daily row read/write limit,
  queries fail until midnight UTC with `Your account has exceeded D1's free tier daily row read
  limit` (or `…row write limit`). The sync route must translate that into a clear "retry later"
  message with the outbox left intact — never a generic 500, which an agent would read as data loss.
- **Keep `run_worker_first` as `["/api/*"]`, never `true`.** Static asset requests are free only
  while they do not invoke the Worker. Setting it to `true` puts the whole app shell on the
  100,000/day meter ([ADR-0003](adr/0003-single-cloudflare-worker.md)).

## Cron Triggers and R2 (ADR-0023)

The retention sweep is one scheduled invocation a day. Cron Triggers are included on the
Workers free plan, and one invocation against a 100,000/day request budget is noise. The
sweep is bounded to `RETENTION_BATCH` (500) rows written per run, which keeps it inside
the D1 daily write quota even on the first run after a backlog — the backlog drains over a
few days rather than in one statement.

Backups go to an R2 bucket. The free tier is 10 GB of storage and 1 million Class A
operations a month; a weekly export of a database measured in megabytes uses one operation
and a rounding error of the storage. The bucket's lifecycle rule expires objects after 90
days, so the total never grows.

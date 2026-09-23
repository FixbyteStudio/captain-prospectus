# API

Base path `/api`. JSON in, JSON out. Every route requires a verified Access identity. Bodies are validated with zod schemas from `src/shared/schemas.ts`; a validation failure returns `400 {error: "validation", issues}`.

## Common
| Route | Role | Purpose |
|---|---|---|
| `GET /api/me` | any | `{email, role}` |

## Local development only
| Route | Purpose |
|---|---|
| `POST /api/dev/seed` | Fills the local database with sample prospects and a script, validated by `devSeedSchema`. Answers 404 unless the request host is localhost **and** `DEV_USER_EMAIL` is set — on localhost the 404 says which is missing. Run through `pnpm db:seed:local` |

## Agent
| Route | Purpose |
|---|---|
| `POST /api/agent/sync` | Push outbox, pull today list + active script. A visit the server cannot take — unknown prospect, or a prospect not assigned to the sender — is quarantined and still reported in `accepted` ([ADR-0022](adr/0022-quarantine-visits-the-server-cannot-take.md)). See [field-operations](domains/field-operations.md#protocol) |
| `GET /api/agent/prospects/:id/visits` | Last `VISIT_HISTORY_LIMIT` (20) visits of a prospect, newest first, `visitHistoryResponseSchema`. Agent: only if assigned to them; a non-UUID `:id` is 400, an unknown one 404. Narrower than the row — `clientVisitedAt`, `receivedAt` and `clientVersion` are clock-skew and upgrade diagnostics, not shown to an agent at a doorstep. Cached in Dexie `visitHistory` so the visit form still shows it offline |

## Admin
| Route | Purpose |
|---|---|
| `GET /api/admin/agents` | `{agents: [{email, role}]}` — everyone a prospect can be assigned to |
| `GET /api/admin/prospects?status=&assignedTo=&source=&limit=&offset=` | `{prospects[], total}`, newest edit first |
| `POST /api/admin/prospects/batch` | Upsert `{source: "csv" \| "osm", rows[]}` by dedupe key → `{created, updated}` |
| `PATCH /api/admin/prospects/:id` | Edit fields, `assignedTo`, `status`, `nextVisitAt` → the updated prospect |
| `POST /api/admin/prospects/assign` | Bulk `{ids[], assignedTo}` → `{assigned}`; `assignedTo: null` unassigns |
| `GET /api/admin/prospects/duplicates` | `{pairs[], truncated}` — prospects that are probably the same place |
| `POST /api/admin/prospects/merge` | `{survivorId, mergedId}` → `{survivorId, mergedId, dedupeKeyUpdated}` |
| `POST /api/admin/prospects/:id/unmerge` | Undo a merge → the restored prospect |
| `POST /api/admin/import/overpass` | `{polygon: [lat,lng][]}` → `{candidates[], truncated, cached}`. Nothing is saved: the candidates go through the same preview and the same `POST /prospects/batch` as a CSV |
| `POST /api/admin/import/places` | `{center: [lat,lng], radius}` → the same `{candidates[], truncated, cached}`. Google Places (ADR-0020); a circle because Nearby Search has no polygon search. **503** when no key is configured |
| `GET /api/admin/visits?since=<ms>&limit=` | `{visits[], serverTime}` — visits with `received_at > since`, newest first, max 500. Each carries `prospectName` |
| `GET /api/admin/visits/orphaned` | `{visits[], remaining}` — the repair queue, newest quarantined first, max 200. Each row carries its `reason`, the `prospectName` when the id still resolves, and up to 5 `candidates` ranked by distance from where the visit happened |
| `POST /api/admin/visits/orphaned/:id/repair` | `{prospectId}` → `{visitId, prospectId, repaired}`. Inserts the visit into `visits`, removes the queue row, derives status. Follows `mergedInto`, so the returned `prospectId` is where it actually landed. `repaired: false` means it was already done (INVARIANT 4). **400** `unknown_prospect` if the target is gone, and the queue row survives |
| `POST /api/admin/visits/orphaned/:id/discard` | Deletes the row for good → `{discarded}`. Idempotent. The one place a visit is deliberately lost, behind a confirmation in the UI |
| `GET /api/admin/scripts` | `{scripts[]}` — all versions, newest first, max 100. At most one has `isActive` |
| `POST /api/admin/scripts` | `{name, questions[]}` → **201** with the created script. Writes version N+1 of that name and makes it the only active one |

## Status codes
| Code | Meaning |
|---|---|
| 400 | Invalid body |
| 401 | No or invalid Access token |
| 403 | Authenticated but wrong role |
| 404 | Unknown resource |
| 413 | Body over `MAX_REQUEST_BYTES`, refused before it is parsed — so before the 426 check and before validation. `error: "too_large"` |
| 426 | `clientVersion` no longer supported: update the app. Checked **before** body validation, so an old build is told to update rather than that its data is invalid |
| 501 | Route declared but not implemented yet (see the roadmap) |
| 503 | Either D1's daily free-tier limit (`d1_limit`) or a map provider with no key (`places_unconfigured`). Nothing was lost; the `error` code says which |
| 502 | A map provider failed or timed out — `overpass_failed` or `places_failed` |

## Payload caps
Every array is bounded, because one request must stay inside the Workers Free
10 ms CPU budget (`docs/free-tier-budget.md`). The limits live in
`src/shared/constants.ts`: 250 import rows, 200 visits and 100 field prospects
per sync, 500 ids per bulk assign, 500 visits per live-feed page, 200 prospects
per list page, 1000 candidates per Overpass import. A Google import is capped at 20 by
Google itself.

Those cap **rows**. `MAX_REQUEST_BYTES` (2 MiB) caps **bytes**, Worker-wide, and is
checked before any body is parsed — the two are not the same thing, because
`answersSchema` does not bound how many answers a visit carries. The field client trims
a sync batch that would exceed it rather than sending one the server must refuse; see
`docs/security.md`.

`GET /api/admin/prospects` returns at most `PROSPECTS_PAGE_SIZE` rows; `total`
counts every row matching the filters, so the list header can say "412
prospects" while holding one page. D1's free tier bills *scanned* rows, which is
why the page size is a cap and not just a default.

`GET /api/admin/prospects/duplicates` compares at most `DUPLICATES_SCAN_LIMIT`
(5000) live prospects and returns at most `DUPLICATES_PAGE_SIZE` (100) pairs,
setting `truncated` when it hit either. Comparing pairs is CPU, which is the
scarce thing in a Worker; prospects are bucketed into ~110 m cells so each one is
only compared with its own cell and the eight around it.

`POST /api/admin/prospects/merge` returns 400 `already_merged` when either side
has already been absorbed, and 404 when either id is unknown. Repeating a merge
that already happened is a 200 no-op (INVARIANT 4).

## The repair queue

A visit the server cannot take is written to `visits_orphaned` rather than `visits`, and
is **still reported in `accepted`** — `accepted` means the server has durably taken the
visit, not that a row exists in `visits`
([ADR-0022](adr/0022-quarantine-visits-the-server-cannot-take.md)). That is what lets a
phone drop a visit whose prospect will never arrive, instead of resending it for ever.

- Two reasons: `unknown_prospect` (the id resolves to nothing) and `not_assigned` (it is
  somebody else's prospect). They differ only in what the admin has to decide — a
  `not_assigned` row is approved by repairing it against the prospect it already names.
- A quarantined visit is **not** in the prospect's history or the live feed. It has no
  settled prospect to belong to until it is repaired.
- Candidates are ranked by distance from the visit's own position, and are empty when the
  visit recorded none — an arbitrary ranking would be worse than offering nothing.
- An empty queue is the healthy state. `remaining` is a smoke alarm: non-zero means look
  upstream, not at the page size.

## The live feed

`GET /api/admin/visits` backs the admin's live feed, polled every 15 s while the
tab is visible (ADR-0010).

- Ordered by **`received_at`**, not `visited_at`. The feed answers "what has
  reached me": a phone that syncs a three-day-old visit this minute is news, and
  `visited_at` comes from a clock that can be wrong (INVARIANT 12).
  `visits_received_idx` exists for this ordering.
- **`since` is exclusive.** The client passes back the highest `receivedAt` it
  has seen and gets only what is newer, which is what makes a 15 s poll cheap.
  Omitted, it returns the most recent page — a freshly opened tab is not empty.
- **Visits of merged prospects are included**, unlike every other admin list,
  which filters `merged_into IS NULL`. This one records what agents did, no
  visit is ever repointed on a merge (`prospecting.md`), and filtering here
  would make history disappear from the feed because an admin tidied a
  duplicate. The name shown is the one the visit was made against.
- `serverTime` is the server's clock as it answered, so a client never has to
  derive a cursor from its own.

## The map import

Two providers, one shape of answer. `POST /api/admin/import/overpass` proxies the
public Overpass API (ADR-0008) and `POST /api/admin/import/places` proxies Google
Places (ADR-0020). The browser never calls either directly (INVARIANT 11), which is
what makes the cache possible — and, for Google, what keeps the API key out of the
page.

- A polygon has 3–200 vertices. Coordinates are rounded to **5 decimals**
  (~1 m) before hashing, so nudging a vertex between two searches still hits the
  same cache entry rather than costing another request.
- Answers are cached in `overpass_cache` for `OVERPASS_CACHE_TTL_MS` (7 days),
  keyed by SHA-256 of the query version plus the rounded polygon. The response
  says `cached: true` when it was served from there, because an answer may be a
  week old and the screen has to be able to say so.
- At most `OVERPASS_CANDIDATES_LIMIT` (1000) candidates, with `truncated` set
  when the polygon held more. That is a CPU cap, not a payload one: waiting on
  Overpass is free, `JSON.parse` and tag mapping are not.
- A candidate is **not** an import row. `name` may be empty and `named` says so:
  OSM has many unnamed amenities, they are worth showing, and `importRowSchema`
  will not accept one. `sourceRef` is always present and is always
  `<type>/<id>` — tier 1 of the dedupe key.
- **502** on a timeout, a 429, a 5xx, or a 200 whose body is not the provider's
  answer (a rate-limit notice arrives as HTML). There is no retry loop on either
  side; the screen offers the admin a retry. For Google a retry is also another
  billable call, so it stays their decision.

### Google Places only
- The request is a **circle**, `{center: [lat, lng], radius}` in metres, 50–2000.
  Nearby Search has no polygon search, which is the only reason the two providers
  take different shapes.
- **At most 20 candidates**, with `truncated` set when the circle held more. That is
  Google's own ceiling — `maxResultCount` caps at 20 and there are no page tokens —
  not a payload cap of ours. Results are ranked by distance from the centre, so a
  truncated answer is a ring around the pin.
- `phone` and `website` are always `null`: both are Enterprise-tier fields, and
  requesting them would bill every search at the higher rate (ADR-0020).
- **503 `places_unconfigured`** when the Worker has no `GOOGLE_PLACES_KEY`. Answered
  before D1 or Google is touched, so a deployment without a billing account costs
  nothing and keeps working. Google's own error bodies are never forwarded.
- The cache is shared with Overpass; hashes carry a per-provider query version, so
  the two cannot read each other's rows.

## Who can be assigned
There is no users table (ADR-0006). `GET /api/admin/agents` returns the union of
the `ADMIN_EMAILS` and `AGENT_EMAILS` vars with each address's role, so the
assign menu has something to offer before anyone has been assigned anything.
Neither var grants access — Cloudflare Access decides who gets in — so
`AGENT_EMAILS` has to be kept in step with the Access policy by hand.

## Conventions
- Timestamps: epoch ms integers.
- IDs created on phones: UUIDv4 (`crypto.randomUUID()`).
- Field names: camelCase in JSON, snake_case in SQL (Drizzle maps them).
- Adding a field is non-breaking. Removing or renaming one in the sync contract requires bumping the minimum `clientVersion` in a later release, after all phones have updated.

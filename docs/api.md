# API

Base path `/api`. JSON in, JSON out. Every route requires a verified Access identity. Bodies are validated with zod schemas from `src/shared/schemas.ts`; a validation failure returns `400 {error: "validation", issues}`.

## Common
| Route | Role | Purpose |
|---|---|---|
| `GET /api/me` | any | `{email, role}` |

## Local development only
| Route | Purpose |
|---|---|
| `POST /api/dev/seed` | Fills the local database with sample prospects and a script. Answers 404 unless the request host is localhost. Run through `pnpm db:seed:local` |

## Agent
| Route | Purpose |
|---|---|
| `POST /api/agent/sync` | Push outbox, pull today list + active script. See [field-operations](domains/field-operations.md#protocol) |
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
| `POST /api/admin/import/overpass` | `{polygon: [lat,lng][]}` → candidates (not saved) |
| `GET /api/admin/visits?since=<ms>` | Visits with `received_at > since`, newest first, max 500 |
| `GET /api/admin/scripts` | All script versions |
| `POST /api/admin/scripts` | Create new version of `{name, questions[]}` and activate it |

## Status codes
| Code | Meaning |
|---|---|
| 400 | Invalid body |
| 401 | No or invalid Access token |
| 403 | Authenticated but wrong role |
| 404 | Unknown resource |
| 426 | `clientVersion` no longer supported: update the app. Checked **before** body validation, so an old build is told to update rather than that its data is invalid |
| 501 | Route declared but not implemented yet (see the roadmap) |
| 503 | D1 daily free-tier limit reached. Nothing was lost; retry later |
| 502 | Overpass failed or timed out |

## Payload caps
Every array is bounded, because one request must stay inside the Workers Free
10 ms CPU budget (`docs/free-tier-budget.md`). The limits live in
`src/shared/constants.ts`: 250 import rows, 200 visits and 100 field prospects
per sync, 500 ids per bulk assign, 500 visits per live-feed page, 200 prospects
per list page.

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

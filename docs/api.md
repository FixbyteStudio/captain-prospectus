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
| `GET /api/agent/prospects/:id/visits` | Last 20 visits of a prospect (agent: only if assigned to them) |

## Admin
| Route | Purpose |
|---|---|
| `GET /api/admin/prospects?status=&assignedTo=&source=` | List prospects |
| `POST /api/admin/prospects/batch` | Upsert `{source: "csv" \| "osm", rows[]}` by dedupe key |
| `PATCH /api/admin/prospects/:id` | Edit fields, `assignedTo`, `status`, `nextVisitAt` |
| `POST /api/admin/prospects/assign` | Bulk `{ids[], assignedTo}` |
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
per sync, 500 ids per bulk assign, 500 visits per live-feed page.

## Conventions
- Timestamps: epoch ms integers.
- IDs created on phones: UUIDv4 (`crypto.randomUUID()`).
- Field names: camelCase in JSON, snake_case in SQL (Drizzle maps them).
- Adding a field is non-breaking. Removing or renaming one in the sync contract requires bumping the minimum `clientVersion` in a later release, after all phones have updated.

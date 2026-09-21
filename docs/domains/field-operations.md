# Field operations

## Today list
- All prospects assigned to the agent with an open status.
- Ordered by **greedy nearest-next** from the phone's current position; prospects without coordinates go last.
- `follow_up` prospects whose `next_visit_at` is in the future are shown in a separate "later" group.
- Each item links to the phone's maps app for navigation.

## Visit
Captured fields: check-in position (one reading, if permitted), `flyer_given`, script answers, `outcome`, optional `follow_up_at`, optional notes.

- The visit form shows the **previous visits' notes** for that prospect when online (`GET /api/agent/prospects/:id/visits`); offline it shows what is cached.
- Required questions of the active script must be answered unless the outcome is `no_contact`.
- `follow_up_at` is required when the outcome is `follow_up`.

## Field prospects
Agents add places not in the base: name and type required, position defaults to current location.

## Offline sync
See [ADR-0007](../adr/0007-offline-first-insert-only-sync.md).

### Local store (Dexie)
| Table | Content |
|---|---|
| `prospects` | Last pulled today list (replaced on each successful sync) |
| `outboxProspects` | Field prospects not yet accepted |
| `outboxVisits` | Visits not yet accepted |
| `meta` | active script, last sync time, agent email |

### Protocol
`POST /api/agent/sync`
```json
{
  "clientVersion": 1,
  "prospects": [{ "id": "uuid", "name": "…", "type": "food_truck", "lat": 0, "lng": 0 }],
  "visits": [{ "id": "uuid", "prospectId": "…", "visitedAt": 0, "outcome": "interested", "flyerGiven": true, "answers": {} }]
}
```
Response
```json
{
  "serverTime": 0,
  "accepted": { "prospects": ["uuid"], "visits": ["uuid"] },
  "idMap": { "client-uuid": "existing-prospect-id" },
  "prospects": [],
  "script": {}
}
```

### Rules
- **Order matters on the server:** field prospects first, then visits (visits may reference a prospect created in the same payload).
- **Dedupe collision on a field prospect:** if the agent adds a place that already exists, the server keeps the existing prospect, returns `idMap[clientId] = existingId`, and rewrites `prospectId` on visits in the same payload. The client applies `idMap` to anything still in its outbox.
- **Idempotency:** resending an accepted payload is a no-op. The client deletes outbox rows only after they appear in `accepted`. A visit the server already holds is listed in `accepted` again, so a phone that lost the first response can still clear its outbox instead of resending for ever.
- **Bounded payload:** the client sends at most `SYNC_VISITS_PER_REQUEST` visits and `SYNC_PROSPECTS_PER_REQUEST` field prospects per sync (`src/shared/constants.ts`) and repeats until the outbox is empty. A phone offline for a week must not build one request that exceeds the Worker's CPU budget.
- **A visit whose prospect the server does not know is held, not dropped.** It stays in the outbox rather than failing the whole batch on a foreign key.
- **Versioning:** `clientVersion` is an integer bumped on any breaking contract change. The server answers `426 Upgrade Required` below the minimum supported version; the client then forces a service worker update *without* dropping the outbox. The version is checked **before** the body is validated, so a build old enough to send a now-invalid shape is told to update rather than that its data is bad.
- **Never lose a visit.** The outbox survives app updates, reloads and failed syncs. Clearing it requires a successful sync.

### Triggers
App start · `online` event · immediately after saving a visit · every 60 s while the app is open.

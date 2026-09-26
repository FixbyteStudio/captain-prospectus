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

### The script is a second step

The form is two screens, not one (`docs/design.md`, "The script is the second
screen"): flyer and outcome first, then the questions and the notes. Principle 6
decides it — a screen that asks two questions is two screens — and choosing the
outcome first is also what says whether the questions are obligatory at all.

- **The script is pinned when the form opens**, read once from `meta.script`. A
  sync landing a newer version mid-visit does not swap the questions under the
  agent's thumb, and the visit records the version it was actually answered with
  (`scripts.md`).
- **Step 2 exists only when there is something to ask.** No cached script, or a
  script whose questions this build cannot render, and the form is one screen
  with the notes inline. A missing questionnaire never stands between an agent
  and a saved visit.
- **`no_contact` still gets step 2, with nothing required.** The notes live
  there, and what an agent reads off a sign in the window is the most useful
  thing they can record about a door nobody answered.
- **A question this build cannot ask is skipped, never fatal.** A script is data,
  not contract shape: `clientVersion` governs the sync payload, not the
  questionnaire inside it, so an admin on a newer build can save a question type
  an older phone has never heard of. That phone renders the rest, saves the
  visit, and sends the answers it does have (`src/shared/answers.ts`). Throwing
  instead would take down the visit form, and an agent who cannot open it loses
  the visit — INVARIANT 5 by another route.

## Field prospects
Agents add places not in the base: name and type required, position defaults to current location.

## Offline sync
See [ADR-0007](../adr/0007-offline-first-insert-only-sync.md).

**Identity has an offline fallback too.** The app shell calls `GET /api/me` on
load; if that fails, it falls back to the last identity `meta.identity` cached,
so an agent standing where `/api/me` cannot be reached still gets their round
instead of a blocked shell. The cached copy proves nothing by itself — the
Worker re-derives identity from the verified Access JWT on every request
(INVARIANT 10) — so a stale or tampered copy unlocks no admin route; a cached
identity opens the field screens only, never `/admin/*`.

### Local store (Dexie)
| Table | Content |
|---|---|
| `prospects` | Last pulled today list (replaced on each successful sync) |
| `outboxProspects` | Field prospects not yet accepted, each stamped `writtenBy` (the email signed in when it was saved) |
| `outboxVisits` | Visits not yet accepted, each stamped `writtenBy` the same way |
| `visitHistory` | Cached `GET /api/agent/prospects/:id/visits` results, one prospect's cache replaced per pull, so the visit form's « Visites précédentes » still shows something with no signal |
| `meta` | active script, last sync time, the last identity `/api/me` returned |

The today list itself is built from `prospects` **and** `outboxProspects`
together: a field prospect the server has not accepted yet still has to be
walkable and visitable in the same offline session that created it, so it is
shown — with no status, since the server has not derived one — until the
outbox row it came from is deleted.

`writtenBy` never goes on the wire. `runSync` sends only the rows stamped with
the identity signed in now (or unstamped, from before Dexie v3), so a row
another agent queued on the same phone is held back, counted apart from the
pending count («N éléments appartiennent à un autre agent…»), and waits until
that agent signs in again — never sent under the wrong name, never dropped.

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
- **"Repeats" means while it is making progress.** `shouldDrain` (`src/client/field/sync-schedule.ts`) goes again only after a pass that succeeded, left rows behind **and** had something listed in `accepted`. The outbox slice is taken from the front, so a pass that accepted nothing would build the identical request again. Since ADR-0022 a quarantined visit is listed in `accepted` too, which is correct — the outbox really is draining, and the front of the queue really does move — so the condition now guards only against a pass the server rejected outright. The pass cap stays as the backstop above it.
- **A visit the server cannot take is quarantined, not dropped and not refused.**
  Two cases: its `prospectId` resolves to nothing, or the prospect belongs to another
  agent ([only the assignee's visit moves status](prospecting.md#prospect-lifecycle)). Either way the visit is written to `visits_orphaned` with a `reason`, listed in
  `accepted`, and left out of the prospect's history until an admin repairs it
  ([ADR-0022](../adr/0022-quarantine-visits-the-server-cannot-take.md)).
  **`accepted` means the server has durably taken the visit, not that a row exists in
  `visits`.** That is what lets the phone let go: before this, an orphan was neither
  stored nor accepted, so the outbox never drained when the prospect genuinely was not
  coming, and a visit for someone else's prospect could move that prospect's status
  (#33). Repairing a row inserts it into `visits` and derives status normally; the admin
  may also discard it, which is the one place a visit is deliberately lost.
- **Versioning:** `clientVersion` is an integer bumped on any breaking contract change. The server answers `426 Upgrade Required` below the minimum supported version; the client then forces a service worker update *without* dropping the outbox (`applyUpdateNow` in `src/client/pwa.ts`, called from `useSync` — it re-checks for a build and activates a waiting one, at most once per page load, and is a no-op when there is nothing to take). The version is checked **before** the body is validated, so a build old enough to send a now-invalid shape is told to update rather than that its data is bad.
- **Never lose a visit.** The outbox survives app updates, reloads and failed syncs. Clearing it requires a successful sync.
- **Attribution:** a visit is always attributed to the agent whose verified JWT sent it, never to a field in the payload.

### Triggers
App start · `online` event · immediately after saving a visit · every 60 s while the app is open.

## Export

`GET /api/admin/visits/export.csv?from=&to=` hands visits to a spreadsheet for a
date range, defaulting to the last 30 days. The range reads **`received_at`, not
`visited_at`**: a phone can sync days late, and a range on the phone's clock
would silently drop exactly those visits (INVARIANT 12). Script answers are not
included — a nested shape in a flat CSV is a decision, not an implementation
detail — and neither are agent positions, whose retention is still undecided.

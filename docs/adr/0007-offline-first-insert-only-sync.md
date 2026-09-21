# ADR-0007: Offline-first, insert-only sync

- Status: accepted
- Date: 2026-09-21

## Context
Agents work on the street with unreliable signal. Visits must never be lost. Admin needs visits quickly. General-purpose sync (CRDTs, conflict resolution) is expensive to build and debug.

## Decision
We will keep a local copy of the agent's list and an outbox in IndexedDB (Dexie) and sync through one endpoint, `POST /api/agent/sync`, that pushes the outbox and pulls the list in one round trip. We design the data so that **there are no conflicts**:
- Agents only **insert** visits and field prospects, with client UUIDs.
- Admins are the only ones who edit prospects directly.
- Status changes caused by visits are computed on the server ([ADR-0011](0011-server-derived-prospect-status.md)).
- All inserts are `ON CONFLICT DO NOTHING`; retries are harmless.
- Field-prospect dedupe collisions are resolved server-side and reported with an `idMap`.
- The payload carries `clientVersion`; the server returns 426 for unsupported versions.

## Alternatives considered
| Option | Why not |
|---|---|
| Online-only app | Unusable with poor signal |
| Replicache / PowerSync / ElectricSQL | Extra service or cost; overkill for insert-only data |
| Background Sync API | Not supported on iOS Safari; we sync on app events instead |

## Consequences
- Agents cannot edit a visit after saving. Corrections are a new visit or an admin action.
- Any future feature that lets agents *edit* shared data must revisit this ADR.
- Old clients may sync for days after a release; the contract must evolve additively.

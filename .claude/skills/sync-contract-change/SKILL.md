---
name: sync-contract-change
description: Change the offline sync protocol (POST /api/agent/sync payload, response, or Dexie outbox) without losing data or breaking phones running an old build. Use for any change to sync, outbox, or field-operation payloads.
---

# Sync contract change

Phones can run an old build for days and hold unsynced visits. Assume both old and new clients hit the new server.

1. Read `docs/domains/field-operations.md` and ADR-0007.
2. Classify the change:
   - **Additive** (new optional field in request, new field in response): ship directly. Server must accept requests without the field.
   - **Breaking** (remove/rename/retype a field, change semantics): 
     1. Release N: server accepts old *and* new shape; client sends new shape; bump `CLIENT_VERSION` in `src/shared/constants.ts`.
     2. Wait until every agent has synced with the new version (check `clientVersion` in logs).
     3. Release N+1: raise `MIN_CLIENT_VERSION`; server may drop the old shape.
3. **Dexie schema changes**: bump the Dexie version with an upgrade function that **migrates** outbox rows, never clears them.
4. Tests: old-shape payload accepted, retry is a no-op, `idMap` rewrite for dedupe collisions, 426 path keeps the outbox.
5. Update the protocol section of `docs/domains/field-operations.md`.

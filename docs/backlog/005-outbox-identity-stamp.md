---
id: 005
status: ready
implements: docs/security.md#threat-model "Agent reading other agents' data", docs/domains/identity-access.md#offline-and-session-expiry
depends_on: []
---

# Stamp outbox rows with the identity that wrote them

## Goal

An outbox row (`outboxVisits`, `outboxProspects`) records which agent's
identity was active when it was written, and `runSync` refuses to push a row
whose stamp does not match the identity currently signed in — so a device that
changes hands never silently attributes one agent's queued work to another.

## Why

Found in the M2 security review (`feat/m2-field-pwa`). The app's offline
identity cache (`docs/domains/identity-access.md#offline-and-session-expiry`)
already clears the cached round and visit history when `/api/me` reports a
different email than the one cached — but it does not touch the outbox
(INVARIANT 5 forbids clearing it on anything but server acceptance). If agent
A queues visits offline and agent B then signs in on the same device before a
sync drains them, the next sync pushes A's visits and the Worker — correctly,
by design — attributes every one of them to B, because `POST /api/agent/sync`
takes `agentEmail` from the verified JWT, never from the payload
(`src/worker/routes/agent.ts`). The server did nothing wrong; the client sent
the wrong thing.

## Acceptance criteria

- [ ] `FieldDb` moves to Dexie version 3. Per the `sync-contract-change` skill
      step 3, it **adds** to the stored shape and does not touch existing rows
      destructively — outbox rows written before the upgrade have no stamp,
      and the upgrade backfills them with the identity currently in
      `meta.identity` (best effort; if none is cached, leave unstamped and
      treat an unstamped row as belonging to whichever identity is current at
      sync time, so nothing already queued is silently dropped by the new
      check).
- [ ] The stamp is **not** added to `Visit` or `FieldProspect` in
      `src/shared/schemas.ts`. Those are the wire contract, and the server has
      no use for this field — it always derives `agentEmail` from the JWT and
      would ignore a client-sent one anyway (INVARIANT 2). Store it as a
      sibling field in the Dexie row only, e.g.
      `type StoredVisit = Visit & { writtenBy: string }`, and strip it back to
      the bare `Visit`/`FieldProspect` shape when `sync.ts` builds
      `SyncRequest` — do not let the extra field leak into the POST body.
- [ ] `fieldDb.outboxVisits.add(...)` / `outboxProspects.add(...)` call sites
      (`VisitScreen.tsx`, `AddProspectScreen.tsx`) write `writtenBy` from the
      current identity at save time.
- [ ] `runSync` (`src/client/field/sync.ts`) partitions the outbox before
      building the payload: rows whose `writtenBy` matches the identity
      `runSync` is called with go in the request as today; rows that do not
      match are excluded from the payload and left in the outbox untouched —
      never sent under the wrong name, never dropped.
- [ ] `useSync.tsx` passes the current identity into `runSync` (today it reads
      the outbox with no identity argument at all) and, when any row was held
      back for a mismatch, surfaces it — a `copy.sync` string, e.g. "N visites
      appartiennent à un autre agent et n'ont pas été envoyées" — distinct from
      the existing `pending` count, so an agent (or whoever next signs in
      correctly) can tell "still offline" apart from "wrong hands wrote this."
- [ ] Tests: a stamped row for identity A is not sent when `runSync` runs as
      B, and is sent once run as A again; an unstamped (pre-upgrade) row is
      sent regardless, once, and gets stamped or removed by the normal accept
      path so it is not held back a second time; the Dexie upgrade test in
      `db.test.ts` gains a case asserting outbox rows survive v2 → v3 exactly
      like the v1 → v2 case already there.
- [ ] `docs/domains/field-operations.md`'s Dexie table description and
      `docs/domains/identity-access.md`'s paragraph about this gap (added in
      the M2 security fix-up) both updated to say it is closed, and this file
      marked `done`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

## Out of scope

- Any change to `POST /api/agent/sync`'s request or response shape — this is
  entirely client-side bookkeeping, not a sync-contract change in the
  `CLIENT_VERSION` sense.
- A UI for resolving a held-back row (re-signing in as the original agent,
  discarding it, reassigning it). The row simply waits; a person decides what
  to do with a phone that has two agents' unsynced work on it, same as today
  they would have to decide what to do with a phone at all.
- Retroactively fixing visits already mis-attributed before this ships — no
  way to tell them apart from a legitimately-B-authored visit after the fact,
  which is exactly the problem this task prevents going forward.

## Notes

This is the one finding from the M2 review that a straightforward fix could
not close inline: it needs its own Dexie migration and its own tests, which is
why it is a separate task rather than folded into that PR. The other two
identity-cache findings from the same review (falling back to cache on a 401,
and not clearing the round/history cache on an identity switch) were fixed
directly in `feat/m2-field-pwa` and do not need repeating here.

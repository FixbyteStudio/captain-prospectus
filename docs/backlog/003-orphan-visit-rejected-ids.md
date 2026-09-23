---
id: 003
status: ready
implements: docs/adr/0022-quarantine-visits-the-server-cannot-take.md, docs/domains/field-operations.md#rules, roadmap M5 "Orphan visits"
depends_on: []
---

# Orphan visits: report rejected ids so phones stop resending

## Goal

A visit the server can never store — its `prospectId` does not exist, because the
prospect was created on another phone and never synced, or was deleted — is
currently retried by the phone for ever: invariant 5 says an outbox row is
deleted only when the server lists it in `accepted`. The server needs a way to
say "never send this again" that cannot be confused with "try later".

## Decided: option B, widened

[ADR-0022](../adr/0022-quarantine-visits-the-server-cannot-take.md) chose **option B**,
and widened it: the quarantine takes an unowned visit (#33) as well as an orphan, because
they are the same shape. The acceptance criteria below are superseded by that ADR and by
the implementation plan; what stays true is the pair the original note ended on — the
change is additive to the sync response, and a phone running the current build must keep
working against the new server.

The three options are kept below because ADR-0022 cites them.

## Why this was not `ready`

This changes the sync contract ([ADR-0007](../adr/0007-offline-first-insert-only-sync.md),
`docs/api.md` process, the `sync-contract-change` skill) and it trades one
invariant against another: invariant 5 exists precisely so that a bug on the
server cannot make a phone drop a visit. Any `rejected` field is a hole in it,
and how big the hole is, is an architectural choice. It needs an ADR, not a
night.

## Options

| Option | Trade-off |
|---|---|
| **A. `rejected: string[]` in the sync response.** The phone deletes those outbox rows. | Smallest change, additive, no migration. But a server-side bug that mistakenly rejects ids destroys visits on the phone with no copy anywhere — the exact failure invariant 5 was written to prevent |
| **B. Server stores the orphan in a `visits_orphaned` table, then reports the id as accepted.** | Nothing is ever lost; the admin gets a repair queue and can repoint the visit once the missing prospect arrives. Costs a table, a migration, and an admin screen nobody has designed |
| **C. Phone gives up after N attempts or M days and moves the row to a local `abandoned` store, surfaced in the UI.** | Needs no server change and no contract change, and the visit stays on the device. But it is invisible to the admin, and a phone that is reinstalled loses it |

## If an ADR picks one

Set this task back to `ready`, put the chosen option in `implements`, and rewrite
the acceptance criteria against it. Whichever wins, two criteria are certain:
the change is additive to the sync response (invariant 9), and a phone running
the current build must keep working against the new server.

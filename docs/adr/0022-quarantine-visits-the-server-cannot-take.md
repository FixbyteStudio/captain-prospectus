# ADR-0022: Quarantine a visit the server cannot take, and let the admin repair it

- Status: accepted
- Date: 2026-09-23
- Deciders: owner
- Supersedes: [ADR-0021](0021-visits-derive-status-only-for-the-assignee.md)

## Context

`POST /api/agent/sync` meets two visits it cannot store as sent, and neither has a good
answer today.

**The prospect does not exist.** `visits.prospect_id` is a foreign key, so the insert
would fail and take the whole batch with it. The route therefore filters the visit out:
it is not stored and not listed in `accepted`, which under INVARIANT 5 means the phone
resends it on every sync for ever. `docs/domains/field-operations.md` records this as a
Known gap and `docs/backlog/003` holds the options. It resolves itself when the prospect
is simply in a later outbox page; it never resolves when the prospect genuinely is not
coming — written on a phone that was wiped, or deleted server-side.

**The prospect is not the sender's.** Sync checked only that the prospect existed, so
either agent could post a visit against any prospect and — because the server derives
status from the newest visit ([ADR-0011](0011-server-derived-prospect-status.md)) —
change it. An outcome of `not_interested` maps to `rejected`, outside `OPEN_STATUSES`,
dropping the prospect off the other agent's today list. Found in the M5 security review
(#33). [ADR-0021](0021-visits-derive-status-only-for-the-assignee.md) narrowed it to
"store the visit, but apply `OUTCOME_TO_STATUS` only for the assignee".

ADR-0021 works, and it bought time, but it pays a price it named honestly: an agent
visits a prospect, the admin reassigns it while the phone is offline, and that real
visit arrives to be stored inertly. Nothing is lost, but nothing prompts anybody either
— the admin has to notice a row in the feed and set the status by hand.

The two cases are one shape: **the server cannot take this visit as sent, and has no way
to say so that neither loses it nor strands it.** `accepted` is the only channel, and it
currently means both "stored" and "you may forget it", which is why every answer so far
has had to trade one invariant against another.

## Decision

We will **store a visit the server cannot take in a `visits_orphaned` table, report its
id in `accepted`, and give the admin a queue to repair it from.**

A visit is quarantined when its prospect does not exist (`reason:
"unknown_prospect"`) or when the prospect is not assigned to the agent who sent it
(`reason: "not_assigned"`). Everything else is inserted into `visits` as today.

Repairing a row inserts it into `visits` against a prospect the admin chooses and
deletes it from the queue, after which status derives normally. For a `not_assigned` row
the admin's choice is usually the prospect the visit already named, so approving and
repointing are the same operation. The admin may also discard a row, which is a
deliberate, confirmed act rather than a silent drop.

**`accepted` means "the server has durably taken this visit", not "a row exists in
`visits`".** That is the one semantic this ADR changes, and it is what lets the phone
let go of a visit the server is still deciding what to do with. It was already the
reading INVARIANT 5 needed — a phone cannot act on a distinction between two server-side
tables — and writing it down is what makes the rest of this possible.

## Alternatives considered

| Option | Why not |
|---|---|
| **Keep ADR-0021** for unowned visits and solve orphans separately | Two answers to one question: one visit stored-but-inert, another quarantined, with nothing to tell a reader which applies. It also leaves ADR-0021's cost in place — the reassignment race still needs a manual status change nobody is prompted to make |
| **Report a `rejected` array** and let the phone delete those rows (`backlog/003` option A) | Smallest change and genuinely additive. But a server-side bug that wrongly rejects an id destroys visits on the phone with no copy anywhere, which is the precise failure INVARIANT 5 exists to prevent. Trading a stuck outbox for silent data loss is the wrong direction |
| **Give up on the phone after N attempts** into a local `abandoned` store (`backlog/003` option C) | Needs no server change at all, and the visit stays on the device. But it is invisible to the admin — nobody ever learns the sync is broken — and a reinstall loses it |
| **Let the visit through and accept the risk** | This is what the code did before ADR-0021, and #33 is why it cannot stand |

## Consequences

- One mechanism covers both cases, and will cover the next one. A future "the server
  cannot take this" reason is a new `reason` value and a queue row, not a new ADR.
- **Nothing is ever lost and nothing is ever stranded.** The phone always makes progress;
  the decision moves to a person who can actually make it.
- It **fixes what ADR-0021 accepted**: a reassignment-race visit now lands in a queue
  that asks the admin to act, instead of sitting inert in `visits` hoping to be noticed.
- ADR-0021's derivation gate becomes unreachable — a non-assignee visit can no longer
  reach `visits` — so it is removed rather than left as a check nothing triggers.
- **Costs a table, a migration and an admin screen.** That is the real price, and it is
  why options A and C existed. It is worth paying once for a mechanism that generalises.
- **`accepted` changes meaning**, which is a sync-contract change in semantics even
  though the response shape is untouched. An old phone is unaffected: it deletes an
  outbox row for a visit the server really did store, which is exactly what it should
  do. No `CLIENT_VERSION` bump.
- A quarantined visit is **not** in the prospect's visit history or the live feed until
  it is repaired. That is intended — it has no settled prospect to belong to — but it
  means the repair queue must be somewhere the admin actually looks.
- `docs/backlog/005` stays necessary and becomes more valuable: when a phone changes
  hands the previous agent's whole queued batch now lands in the repair queue instead of
  on the wrong prospects, which is a far better failure, but stamping the outbox is still
  what stops it happening.
- It does not make the admin's job free. A queue nobody reads is a queue that silently
  grows, which is why discard exists and why the screen needs a real design pass.

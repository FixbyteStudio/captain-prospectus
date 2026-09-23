# ADR-0021: A visit derives prospect status only when its author is the assignee

- Status: proposed
- Date: 2026-09-23
- Deciders: owner

## Context

`POST /api/agent/sync` checks that a visit's `prospectId` exists, never that the
prospect is assigned to the caller (`src/worker/routes/agent.ts`). The server then
derives that prospect's `status`, `last_visit_at` and `next_visit_at` from the newest
visit ([ADR-0011](0011-server-derived-prospect-status.md)).

Together those two facts mean any agent who has passed Cloudflare Access can post a
visit against any prospect in the database and change its status. An outcome of
`not_interested` maps to `rejected`, which is outside `OPEN_STATUSES`, so the prospect
silently leaves the other agent's today list and the admin's open workload. Found in
the M5 security review and filed as #33; `docs/security.md` claimed the opposite
("agent routes filter by the verified email"), which is true of the reads and was
false of the writes.

Attribution cannot be forged: `visits.agent_email` comes from the verified JWT
(INVARIANT 10), never from the payload. Only the target could be chosen freely.

The constraint that makes this awkward is INVARIANT 5, **never lose a visit**. The
same code path carries a case that is entirely legitimate: an agent visits a prospect,
the admin reassigns it while the phone is offline, and the visit arrives afterwards.
That visit is true — somebody knocked on that door — and the database has no
assignment history, so after the fact the server cannot tell it apart from a visit
that was never the agent's to make.

This app has two agents and one admin, all employees. The realistic failure is not an
agent choosing to sabotage a colleague's round; it is a phone changing hands
(`docs/backlog/005`) or a bug, with the server accepting the result either way.

## Decision

We will **store and accept every visit exactly as today, and apply
`OUTCOME_TO_STATUS` only when the visit that would drive the change was written by
the prospect's current assignee.**

A visit from anyone else is inserted, attributed to its real author, returned in
`accepted` so the phone clears its outbox, and simply does not move the prospect. The
admin surface computes the mismatch by comparing `visits.agent_email` with
`prospects.assigned_to`; it is not stored, because it is a fact about the present
assignment rather than about the visit.

An unassigned prospect has no assignee, so no agent visit derives its status. Agents
never pull unassigned prospects — the today list filters on `assigned_to = email` —
so this case is already anomalous when it appears.

## Alternatives considered

| Option | Why not |
|---|---|
| Refuse the visit and report its id in an additive `rejected` array, as `docs/backlog/003` option A proposes for orphans | Security-cleanest, and it would share a mechanism with the orphan-visit problem. But it destroys the reassignment-race visit with no copy anywhere, which is the precise failure INVARIANT 5 exists to prevent, and it moves the sync contract for a threat that does not justify the risk |
| Quarantine the visit in a holding table and report it as accepted (`docs/backlog/003` option B) | Loses nothing and closes the hole completely, but costs a table, a migration and an admin repair screen nobody has designed. Disproportionate to a two-agent, one-admin deployment |
| Filter `insertable` on `assigned_to = email` and drop the rest silently | Drops a real visit *and* leaves it in the outbox for ever, because a visit that is neither stored nor listed in `accepted` is one the phone resends on every sync. Strictly worse than both options above |
| Leave it and rely on Access | Access authenticates; it does not authorize between the two agents. It is also the control that fails in the case we actually expect, a phone in the wrong hands |

## Consequences

- The damaging half of #33 closes with **no migration and no change to the sync
  contract**, so no `clientVersion` bump and no phone-compatibility window.
- Nothing is lost. Every visit is still stored, still attributed, still in `accepted`.
- **A reassignment-race visit no longer updates the prospect.** The visit is visible in
  the live feed and the admin can set the status by hand, which ADR-0011 already allows
  — but it is a manual step where today it was automatic, and an admin who misses it
  leaves the new assignee to walk to the same door. This is the cost of the decision
  and it is accepted knowingly.
- A field prospect that dedupes onto an existing prospect belonging to the other agent
  behaves the same way: the visit is kept, the status is not moved.
- It does **not** close #33 completely. A rogue client can still write visit rows
  against prospects it does not own; they are attributed and visible, and they no
  longer change anything an agent or the admin acts on.
- Orphan visits (`docs/backlog/003`) stay a separate problem with a separate decision.
  Refusing this ADR's option 2 means the two no longer share a mechanism.
- `docs/backlog/005` stays necessary. This ADR stops a wrong-hands visit from moving a
  prospect; only the client-side identity stamp stops it being written under the wrong
  name in the first place.

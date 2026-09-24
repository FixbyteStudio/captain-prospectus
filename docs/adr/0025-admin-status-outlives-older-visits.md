# ADR-0025: An admin's manual status is not undone by an older visit

- Status: accepted
- Date: 2026-09-24
- Deciders: mohss, Claude
- Amends: [ADR-0011](0011-server-derived-prospect-status.md)

## Context
ADR-0011 has the server derive a prospect's status from its latest visit, so a visit that syncs late
never overwrites a newer outcome. It also says admin status changes remain possible, with "last write
wins".

The code did not behave that way. Every visit the server takes re-derives the status from the latest
visit by `visited_at`. An admin's edit is not a visit, so nothing weighs it. An agent offline for two
days is normal, so this sequence happens:

1. Monday: an agent records `no_contact`, offline.
2. Tuesday: the admin closes the prospect as `converted` after a phone call.
3. Wednesday: the phone syncs Monday's visit. The prospect goes back to `follow_up` and reappears
   on the agent's round.

Monday's visit is older than Tuesday's decision, but it wins. Repairing a quarantined visit goes
through the same derivation (ADR-0022), so it does the same.

## Decision
We will store when an admin last set a prospect's status by hand, and a visit will move the status
only when it is newer than that.

- New nullable column `prospects.status_set_at`, written by `PATCH /api/admin/prospects/:id` when
  the patch carries `status`, and by nothing else. Assignment, imports and merges leave it alone.
- The derivation compares the latest visit's clamped `visited_at` with `status_set_at`. If the visit
  is newer, or no admin has set the status, the visit sets `status` and `next_visit_at` as before.
  If not, both keep the admin's values.
- `last_visit_at` always moves: the visit happened, whoever decides the status.
- A tie goes to the admin.

## Alternatives considered
| Option | Why not |
|---|---|
| Keep last write wins | "Last write" here means the last visit to *sync*, not the last thing to happen. An older fact beats a newer decision, and the admin cannot see why their close undid itself |
| Lock the status for good once an admin sets it | A real visit after the admin's change, such as a reopened prospect the agent then converts, would never count again |
| Compare against `updated_at` | Imports, assignment and the derivation itself all change it, so it does not say when the admin made a decision |
| Compare against the visit's `received_at` | Monday's visit is *received* on Wednesday, after the admin's edit, so it would still win. `visited_at` is when it happened |

## Consequences
- A manual close or reopen holds until a visit made after it. Sync and orphan repair agree, because
  both call `deriveProspectStatus`.
- The column is nullable and has no backfill. Rows from before this change behave exactly as they
  did, and the Worker already deployed ignores the column.
- The rule depends on `visited_at` being honest. INVARIANT 12's clamp is what stops a phone that is
  a week ahead from overriding every admin decision.
- Harder: a prospect's status now depends on two things, its visits and the admin's timestamp. The
  admin screen does not yet say "set by hand"; if it ever needs to, the column is there. It is not in
  the wire contract.

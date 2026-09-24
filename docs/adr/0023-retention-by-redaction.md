# ADR-0023: Keep the visit, drop the personal parts after 90 days

- Status: accepted
- Date: 2026-09-23
- Deciders: owner
- Amends: the append-only rule on `visits` (`.claude/skills/d1-migration`)

## Context

`docs/security.md` has said since M0 that retention must be "defined before
go-live", and the roadmap carries it as an M5 item. Nothing has been defined, so
today the answer is "for ever" by omission — which is the weakest possible
position to be in for the two fields that actually matter.

**Agent location is personal data.** One `getCurrentPosition` reading is written
to each visit at check-in (`security.md`). Two named employees, one row per
doorstep: kept indefinitely, that is a movement history nobody agreed to.

**Visit notes are free text.** They are business observations, but they are typed
about people and can name them — "le patron, M. Untel, repasser jeudi".

Against that, the *fact* of a visit is the product. Visit counts, conversion
rates, a prospect's own timeline and the `last_visit_at` that drives its status
(ADR-0011) are all business history with no expiry.

Two existing rules pull in opposite directions here:

- **INVARIANT 5, never lose a visit**, which is written against losing a visit by
  accident — a client dropping a row, a server bug rejecting one.
- **`visits` is append-only**, recorded in the `d1-migration` skill as a flat
  "never update or delete rows in `visits`". It exists so that sync stays
  idempotent and so that history cannot be quietly rewritten.

Issue #34 forces the question from the other side: `backup.yml` uploads the whole
database to a GitHub artifact for 90 days, which contradicts `security.md`'s
"data stays in the Cloudflare account" and would outlive any retention rule we
set on the live database.

## Decision

We will **keep every visit for ever and redact its personal fields after 90
days**: `lat`, `lng` and `notes` are set to NULL once `received_at` is older than
`RETENTION_DAYS`. Everything else — date, outcome, agent, flyer, follow-up,
answers — is kept.

A **Cloudflare Cron Trigger** runs the sweep daily. It is bounded to
`RETENTION_BATCH` rows per run and is idempotent: a redacted row no longer
matches, so a second run in the same day does nothing.

This is a **narrow amendment to the append-only rule**, not its removal. The
amended rule reads: *nothing updates or deletes a row in `visits` except the
retention sweep, which only ever nulls `lat`, `lng` and `notes`.* No row is
deleted, no outcome is rewritten, and nothing the sync path or the derived status
depends on is touched — so idempotent sync and INVARIANT 3 are unaffected.

`received_at` is the clock, not `visited_at`: the phone's clock can be wrong
(INVARIANT 12), and retention measured against it could redact a visit the day it
arrives or never redact one at all.

Backups move to **R2**, inside the Cloudflare account, which is what
`security.md` already claims. R2's free tier is 10 GB against a database measured
in megabytes, so ADR-0002 holds.

## Alternatives considered

| Option | Why not |
|---|---|
| Delete the whole visit row after 90 days | Cleanest privacy story, but it destroys business history: visit counts and conversion rates silently shift, a prospect's timeline gains holes, and a deleted visit cannot be told apart from one that never happened. It would also break `last_visit_at`, which ADR-0011 derives from the visit that no longer exists |
| Write the policy and purge by hand before go-live | No ADR, no schema exception, no scheduled job. But a written policy that nothing enforces is precisely the gap the M5 security review spent a PR closing — `security.md` claiming a mitigation the code does not implement |
| Stop storing positions altogether | Removes the question permanently, and is tempting. But the distance-ordered round (`orderByNearestNext`) and any "was this visit really made there" check both lose their basis, and the reading is already one-shot and disclosed to agents |
| Keep the GitHub artifact, shorten its window (#34) | Much smaller change, but the data still leaves the Cloudflare account, so `security.md` would have to be amended to admit a third-party flow rather than the workflow being fixed to match it |

## Consequences

- `security.md`'s retention line becomes a number the code enforces, and the
  threat model stops carrying an undefined promise.
- **The append-only rule gains its first exception**, which is a real cost: the
  `d1-migration` skill, `schema.ts` and `data-model.md` all have to state the
  exception, and a future reader must not read it as permission for a second one.
- A visit older than 90 days can no longer be checked against where it was made.
  That is the point, and it means any dispute about a visit has a 90-day window.
- The sweep is a new failure mode that fails quietly: if the cron stops firing,
  nothing breaks and nobody notices. The release checklist gains a check, and the
  sweep logs what it redacted.
- **Someone must create the R2 bucket** and set the CI token's permissions. Like
  the D1 database, that is one-time account setup and belongs in M6's runbook, not
  in code.
- Exports are unaffected: the visits export already excludes positions, and notes
  older than 90 days simply come out empty.

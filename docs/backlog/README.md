# Backlog

One file per task, `NNN-kebab-slug.md`. This is the queue the **night shift**
reads ([ADR-0016](../adr/0016-autonomous-overnight-agent-runs.md)): a scheduled
run picks the lowest `id` that is `ready`, whose `depends_on` are all `done`, and
for which no `claude/<id>-*` branch exists on `origin`.

It is not a second roadmap. [roadmap.md](../roadmap.md) stays the milestone view;
a backlog file is one executable slice of it and must name, in `implements`, the
ADR, domain doc or roadmap item it comes from. **A task that implements nothing
written down is not `ready`.**

## Frontmatter

| Field | Meaning |
|---|---|
| `id` | Three digits, never reused, matches the filename |
| `status` | `ready` — implementable tonight · `needs-decision` — waiting on an ADR or an answer from the owner · `done` — merged |
| `implements` | ADR number, `docs/…` anchor, or roadmap milestone item. Required |
| `depends_on` | List of ids that must be `done` first. `[]` if none |

## Writing one

The acceptance criteria are read at 01:00 by an agent with nobody to ask, so they
carry the whole specification:

- Each criterion is **checkable** — a command to run, a file to look at, a
  response shape to assert. "Works well" is not a criterion.
- Name the schema, table, route and copy key by their real identifiers.
- **Out of scope** is not optional. It is what stops one task becoming three.
- If the task needs a decision the docs do not contain, file it as
  `needs-decision` with the options, and do not mark it `ready` until an ADR
  answers it.

Start from [000-template.md](000-template.md).

## Status

| id | Task | Status |
|---|---|---|
| [001](001-prospect-csv-export.md) | CSV export of the prospect ledger | done |
| [002](002-visit-csv-export.md) | CSV export of visits | done |
| [003](003-orphan-visit-rejected-ids.md) | Orphan and unowned visits: quarantine, then repair | done (ADR-0022) |
| [004](004-field-bundle-budget.md) | Bring the field entry chunk back under its bundle budget | done (ADR-0017; budget superseded by ADR-0026) |
| [005](005-outbox-identity-stamp.md) | Stamp outbox rows with the identity that wrote them (merge before #119) | done |
| [006](006-agent-comment-cites-adr-0022.md) | Point the sync route's assignee comment at ADR-0022 (#47) | ready |
| [007](007-sync-body-parsed-once.md) | Parse the sync body once, keeping 426 ahead of validation (#31) | ready |
| [008](008-d1-limit-detection-and-logs.md) | Recognise D1's daily-limit error through Drizzle, redact error logs (#37) | ready |
| [009](009-geolocation-fixture-for-dom-tests.md) | Let a DOM test choose the agent's position (#87) | ready |
| [010](010-offline-admin-dom-test.md) | Pin that an offline admin opens the field side (#85) | done (superseded by #115) |
| [011](011-top-bar-secondary-handlers-dom-tests.md) | Pin the admin top bar's remaining handlers (part of #86) | ready |
| [012](012-evict-expired-map-cache-rows.md) | Evict expired map-cache rows in the daily sweep (#25) | ready |
| [013](013-sync-identity-from-cache.md) | Do not stamp or sync under an unconfirmed cached identity | needs-decision |

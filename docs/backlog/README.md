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
| [004](004-field-bundle-budget.md) | Field entry chunk is 8 kB over its bundle budget | needs-decision |
| [005](005-outbox-identity-stamp.md) | Stamp outbox rows with the identity that wrote them | ready |

---
id: 002
status: ready
implements: roadmap M5 "CSV export of prospects and visits"
depends_on: [001]
---

# CSV export of visits

## Goal

An admin can download visits as a CSV file for a date range, to see what the
field agents actually did.

## Acceptance criteria

- [ ] `GET /api/admin/visits/export.csv?from=<ms>&to=<ms>` in
      `src/worker/routes/admin.ts`, behind `requireAdmin`.
- [ ] A new `visitsExportQuerySchema` in `src/shared/schemas.ts`: `from` and `to`
      optional `epochMsSchema`, defaulting to the last 30 days and now; the schema
      refuses `from > to` with a zod refinement, so the route answers 400.
- [ ] Reuses the serialiser written for [001](001-prospect-csv-export.md). If it
      needs a second shape, generalise it — do not copy it.
- [ ] Columns: `visited_at,received_at,agent_email,prospect_name,outcome,flyer_given,follow_up_at,notes`,
      timestamps ISO-8601. Joined to `prospects` for the name.
- [ ] Filtered on `receivedAt`, not `visitedAt` — a phone can sync days late and a
      range on the phone's clock would silently drop those visits
      (`CLAUDE.md` invariant 12).
- [ ] Ordered `receivedAt` desc, capped at 500 rows, `x-truncated: true` when
      capped, same `content-disposition` pattern with `visits-<YYYY-MM-DD>.csv`.
- [ ] Notes are free text written outdoors: the test includes a note with a
      newline, a comma and a quote, and asserts the file still parses as one row.
- [ ] Docs updated: `docs/api.md`, and the export line in
      `docs/domains/field-operations.md`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

## Out of scope

- The download button and any French copy.
- Answers to script questions (the `answers` JSON column) — a nested shape in a
  flat CSV is a decision, not an implementation detail. File it if you want it.
- Agent positions. That is personal data and its retention is undecided
  (roadmap M5).

## Notes

Depends on 001 only for the serialiser. If 001 landed with a shape that does not
generalise, say so in the PR body rather than duplicating the code.

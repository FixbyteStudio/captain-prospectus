---
id: 001
status: ready
implements: roadmap M5 "CSV export of prospects and visits", docs/domains/ingestion.md#attribution
depends_on: []
---

# CSV export of the prospect ledger

## Goal

An admin can download the prospect ledger as a CSV file, filtered exactly as the
list screen filters it, so the data is usable outside the app.

## Acceptance criteria

- [ ] `GET /api/admin/prospects/export.csv` is mounted in `src/worker/routes/admin.ts`,
      behind the existing `requireAdmin` middleware, and **above** the
      `/api/admin/prospects/:id` routes so the literal path is not read as an id.
- [ ] Its query string is validated by a new `prospectsExportQuerySchema` in
      `src/shared/schemas.ts` — `status`, `assignedTo` and `source`, the same
      three optional filters as `prospectsQuerySchema`, and **no** `limit` or
      `offset`. Reuse `statusSchema`, `emailSchema` and `sourceSchema`; do not
      write the enums again.
- [ ] Merged prospects are excluded: the query filters `mergedInto` is null, like
      every other list query (see the comment on the column in
      `src/worker/db/schema.ts`).
- [ ] Response headers: `content-type: text/csv; charset=utf-8` and
      `content-disposition: attachment; filename="prospects-<YYYY-MM-DD>.csv"`,
      the date taken from the request time in UTC.
- [ ] Columns, in this order, with a header row of exactly these names:
      `name,type,address,phone,website,cuisine,status,assigned_to,source,lat,lng,last_visit_at,next_visit_at`.
      Header names are snake_case like the columns; timestamps are ISO-8601
      strings, not epoch ms, because a spreadsheet cannot read epoch ms.
- [ ] A field containing `,`, `"` or a newline is quoted, and an embedded `"` is
      doubled. A null is an empty field, never the text "null".
- [ ] The last line is the attribution comment `# © OpenStreetMap contributors`
      (`docs/architecture.md` invariant 9). A test asserts it is present.
- [ ] The row cap is `500`, ordered by `updatedAt` desc like the list, and a
      capped export sets the response header `x-truncated: true`. Justify the
      number against the 10 ms CPU budget in a comment (`CLAUDE.md` invariant 13).
- [ ] The CSV serialiser is a pure function in `src/shared/` with its own unit
      test covering: quoting, nulls, an empty result set (header + attribution
      only), and a value that begins with `=`.
- [ ] A worker test in `src/worker/admin.test.ts` asserts the status, both
      headers, the header row, and that an agent (not an admin) gets 403.
- [ ] Docs updated: the route row in `docs/api.md` under Admin, and a line in
      `docs/domains/prospecting.md`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

## Out of scope

- **The download button.** The UI needs a design pass
  ([ADR-0014](../adr/0014-tailwind-and-shadcn-ui.md)); this task ships the
  endpoint only and adds no French copy.
- Visits export — that is [002](002-visit-csv-export.md).
- Streaming or pagination beyond the 500-row cap.
- Excel formula-injection escaping (the leading-`=` test only pins current
  behaviour; changing it is a decision, not a fix).

## Notes

This task exists partly to validate the night-shift loop end to end, so it is
deliberately self-contained: one Worker route, one shared pure function, two
tests, two doc lines. It touches no client code and no migration.

`CLAUDE.md` invariant 6 applies — the query goes through a zod schema from
`src/shared/schemas.ts`, never inline validation in the route.

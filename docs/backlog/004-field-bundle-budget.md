---
id: 004
status: done
implements: docs/vision.md#success-criteria "field route JS stays under 150 kB gzipped"
depends_on: []
settled_by: docs/adr/0017-zod-mini-for-the-shared-wire-contract.md
---

# Bring the field entry chunk back under its bundle budget

## Goal

The field route's JS is 158 kB gzipped, 8 kB over the budget in
[vision.md](../vision.md). An agent can still complete a visit offline in under
60 seconds — the budget is a bad-connection *download* concern, not a
correctness one — but the number is real and the repo has held this line since
ADR-0014.

## Why it happened

`zod` was never actually in the field entry chunk before M2: `sync.ts` has
imported `syncResponseSchema` since M1, but nothing called `runSync` from the
app, so the whole module — and the ~30 kB gzipped `zod` brings with it — tree-shook
out. Wiring the sync engine to the app was M2's actual job, and it makes that
import reachable for the first time. [ADR-0015](../adr/0015-native-controls-on-the-field-route.md)
compounds it deliberately: visit and field-prospect drafts validate against the
shared `visitSchema` / `fieldProspectSchema` rather than a form library, which is
cheaper than `react-hook-form` but still pulls the schema module in.

Lazy-splitting `VisitScreen` and `AddProspectScreen` out of the entry chunk (done
in M2) bought back only ~2 kB, because those screens are not where the weight is
— `src/shared/schemas.ts` is one file holding every wire schema, admin routes
included, and `today.ts`/`visit-draft.ts` import from it for the two or three
schemas the field side actually needs.

## Decision needed

Pick one (or say "accept the number, raise the budget," which is also a
decision, not a default):

- **A. Split `src/shared/schemas.ts` by domain** (`schemas/prospects.ts`,
  `schemas/sync.ts`, `schemas/admin.ts`, …), re-exported from the current path
  for the Worker side. A field screen would then import only the sync and
  field-prospect schemas, not the admin, script and merge ones sitting in the
  same file today. Biggest potential win; touches every route file's imports.
- **B. `zod/mini`** for the field-reachable schemas only (`zod/v4-mini`,
  functional composition instead of `.object()` chains). Needs a compatibility
  pass: `.refine()`, `.default()`, `.nullish()` and `safeParse` all exist in
  mini but the call shapes differ, and `sync.ts` / `visit-draft.ts` both have
  passing tests that assert on today's zod error shape.
- **C. Hand-write the two or three checks the field side actually needs**
  (`syncResponseSchema`, `visitSchema`, `fieldProspectSchema` have maybe a dozen
  fields between them) and keep zod only in the Worker, where CLAUDE.md
  invariant 6 actually requires it. Smallest dependency footprint, but a second
  copy of validation logic to keep in sync with the shared schema by hand —
  exactly the duplication `src/shared` exists to prevent.
- **D. Accept 158 kB and move the number in vision.md.** Honest, but it gives up
  the thing the budget was protecting, and ADR-0014's whole argument for the
  split was measuring first.

## Acceptance criteria

- [x] An ADR records the choice (this is an architectural trade, not a patch —
      new-adr skill). [ADR-0017](../adr/0017-zod-mini-for-the-shared-wire-contract.md).
- [x] `pnpm build` reports the field entry chunk at or under the budget the ADR
      settles on. **141.95 kB against the unchanged 150 kB budget.**
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green, including
      the existing `sync.test.ts` and `visit-draft.test.ts` suites unchanged in
      what they assert (only how the assertions are produced, if B or C).
      **246 tests pass and neither suite needed an edit at all.**
- [x] `docs/vision.md`'s measured-bundle paragraph updated with the new number
      and this backlog item marked `done`.

## Out of scope

- Any change to the admin chunk's budget — it has none.
- Re-litigating ADR-0015's native-controls decision; this is about the schema
  import surface, not the form controls.

## Notes

Whichever option, measure with `pnpm exec vite build --sourcemap` and the
per-package breakdown method in the M2 PR description, not the top-line gzip
number alone — that is what told the difference between "Radix costs 38 kB" (a
real, fixable barrel-import problem, fixed in M2) and "zod costs 30 kB" (the
real, structural cost this task is about).

## Outcome

**Option B (`zod/mini`), and option A was measured and rejected.**

The decision section above assumed the field side drags in admin schemas it never
uses. It does not: rolldown already tree-shakes them, and every wire schema in the
repo together is 3.2 kB raw in the entry chunk, so splitting the file was worth
about 1 kB. The overage was zod's runtime — 88.6 kB raw / 27.8 kB gzipped, of which
17.4 kB raw is `to-json-schema` machinery nothing calls.

Writing the contract in `zod/mini` took the entry chunk from **158.78 kB to
141.95 kB gzipped**, and the Worker bundle from 110.26 to 83.93 kB as a side
effect. One definition still serves both sides — `@hono/zod-validator` accepts a
mini schema, because both flavours are `$ZodType` — so option C's duplication was
avoided. See [ADR-0017](../adr/0017-zod-mini-for-the-shared-wire-contract.md) for
the full attribution table and the compatibility checks.

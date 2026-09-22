# ADR-0017: Write the shared wire contract in `zod/mini`

- Status: proposed
- Date: 2026-09-22
- Deciders: mohss, Claude

## Context

The field route's JavaScript is **158.78 kB gzipped** against the 150 kB budget in
[vision.md](../vision.md). [backlog/004](../backlog/004-field-bundle-budget.md)
opened at the end of M2 to settle it, and
[ADR-0015](0015-native-controls-on-the-field-route.md) requires a re-measurement
before M3 spends anything further.

Backlog/004's leading proposal was **A: split `src/shared/schemas.ts` by domain**,
on the theory that the field side drags in the admin, script and merge schemas it
never uses. Attributing the entry chunk through its own sourcemap says otherwise:

| Source | raw | ~gzip | share |
|---|---|---|---|
| react-dom | 202.5 kB | 63.4 kB | 41.1% |
| dexie | 93.1 kB | 29.2 kB | 18.9% |
| **zod** | **88.6 kB** | **27.8 kB** | **18.0%** |
| react-router | 36.7 kB | 11.5 kB | 7.5% |
| tailwind-merge | 26.8 kB | 8.4 kB | 5.5% |
| `src/client` + `src/client/field` | 25.3 kB | 7.9 kB | 5.2% |
| **`src/shared/schemas.ts`** | **3.2 kB** | **~1.0 kB** | **0.6%** |

**Rolldown already tree-shakes the unreachable schemas.** Every wire schema in the
repo, admin ones included, is 3.2 kB raw in that chunk — option A was worth about
1 kB, not the 3–6 kB it was sold as. The weight is zod's *runtime*, and 17.4 kB
raw of it is `to-json-schema.js` + `json-schema-processors.js`, JSON-Schema
conversion machinery this app never calls, reachable only because the classic
barrel exports `z.toJSONSchema`.

`zod/mini` is the same v4 core with a smaller surface: `.check(...)` and
standalone wrappers instead of chained methods. A probe bundling an equivalent
schema set measured **8.1 kB gzipped** against classic's 27.8 kB in the real chunk.

The compatibility questions were checked before committing to it, because the
contract has to keep serving both sides from one definition:

- `@hono/zod-validator` types its schema parameter as `v3.ZodType | v4.$ZodType`,
  and a mini schema **is** a `$ZodType`. `validate()` takes it unchanged.
- `safeParse`, and the `issues` array `validate()` turns into a 400, are identical —
  same core, same codes, same `path`.
- Every construct the contract uses exists: `z._default`, `z.partial`, `z.coerce`,
  `z.refine` with `path`, `z.record`, `z.tuple`, `z.nullish`, `z.overwrite`.
- Mini schemas expose `~standard`, so a Standard Schema resolver can drive
  react-hook-form from them when M3 needs it.

## Decision

**We will write `src/shared/schemas.ts` in `zod/mini`, and we will not split it by
domain.**

One definition per contract, imported by the Worker and the client alike, exactly
as before. `src/worker/validate.ts` types its parameter as `$ZodType` from
`zod/v4/core` rather than classic's `ZodType`.

We do not split the file, because the measurement says it buys ~1 kB for churn
across every route's imports. Splitting is a thing to do when a file is hard to
read, not as a bundle tactic that the build already performs.

One behavioural detail is load-bearing: `emailSchema` used `.toLowerCase()`, which
**normalises**. Mini's `z.lowercase()` is a *check* that would reject `A@b.com`
instead of folding it, so the schema uses `z.overwrite((v) => v.toLowerCase())`.
An admin typing a capital into the assign box is not an error to report.

## Alternatives considered

| Option | Why not |
|---|---|
| **A. Split `src/shared/schemas.ts` by domain** (backlog/004's lead option) | Measured at ~1 kB gzipped. Rolldown already drops what the field side does not import; the premise that admin schemas ride along was simply wrong |
| **C. Hand-write the field-reachable checks and keep zod in the Worker only** | The biggest single win — it removes zod from the field chunk outright — but it is a second copy of the contract to keep in step by hand, which is the duplication `src/shared` exists to prevent. It also forecloses driving react-hook-form from the shared schema, which M3 needs |
| **D. Accept 158 kB and move the number in vision.md** | ADR-0014's argument for the budget was measuring first. There is a real 17 kB win available; taking the budget instead of the win is the outcome the budget exists to prevent |
| Drop `tailwind-merge` (8.6 kB gzip, third-largest of ours) | A real cost and a fair future target, but it is load-bearing for every vendored shadcn component's `cn()`. Out of scope here — this ADR is about the schema runtime |

## Consequences

- **The field entry chunk is 141.95 kB gzipped, under the 150 kB budget**, down
  16.83 kB. Measured with `pnpm build` after `pnpm lint`, `pnpm typecheck` and 246
  passing tests, with the per-package breakdown above regenerated from the new
  sourcemap: zod falls from 88.6 kB to 30.0 kB raw.
- **The Worker bundle falls 110.26 → 83.93 kB gzipped**, unasked-for but welcome:
  less script to parse on a cold start is directly INVARIANT 13's 10 ms CPU budget.
- **Precached bytes fall from 842 KiB to 782 KiB** across the 14 entries, which is
  what an agent actually downloads when installing the PWA.
- **Harder: the schema file is more verbose.** `z.string().check(z.trim(), z.maxLength(200))`
  where it used to read `z.string().trim().max(200)`. The file's header says why, so
  the next person does not "tidy" it back to the classic API and silently add 17 kB.
- **Harder: examples found online are classic-API.** Anything copied in needs
  translating. `shortTextRequired` exists so the commonest case is named once.
- **The headroom is not large.** 8 kB sits between here and the budget, and M3's
  form-stack decision spends most of it. That measurement belongs to its own ADR,
  which now has an honest baseline to work from.
- **backlog/004 is closed** by this ADR.

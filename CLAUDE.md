# CLAUDE.md — rules for AI agents working in this repo

Captain Prospectus: B2B field-canvassing app. Admin imports restaurants/food trucks (CSV, or an area on the map) and assigns them; 2 field agents visit them from an offline-first PWA. Read `docs/vision.md` once, `docs/glossary.md` always.

## Stack (decided — see docs/adr)
Vite + React SPA/PWA · React Router · Hono on one Cloudflare Worker · D1 + Drizzle · Dexie · Leaflet + Overpass (+ optional Google Places, ADR-0020) · Cloudflare Access · TypeScript strict · zod · Vitest.
Styling is Tailwind CSS v4 with shadcn/ui elements vendored into `src/client/ui/` (ADR-0014); the UI is in French while code, DB values and docs stay English; TanStack Query is admin-side only (ADR-0013).
Do not introduce Next.js, another database, another host, an auth library, a second CSS or component framework beside Tailwind + shadcn, or an i18n library. A paid API needs the owner's explicit consent in an ADR (ADR-0020); Google Places is the only one that has it.

## Before you change anything
1. Architecture, data model, sync, auth, dependencies → read the relevant ADR in `docs/adr/`. If your change contradicts one, stop and propose a new ADR instead.
2. Business rules → read the domain doc in `docs/domains/`. Code must match the doc; if they disagree, ask.
3. Use the glossary's words in code, UI and commits.

## Stay in scope
One concern per change. When you find a bug, inconsistency or code/doc drift that your task did not cause and that does not block it:
1. **Do not fix it here.** An unrelated fix in the same diff is harder to review and impossible to revert on its own.
2. **Open an issue** — `gh issue list --search "<keywords>"` first, then `gh issue create --label found-in-passing` with the "Found during work" template. One issue per finding.
3. **Report it in your final summary**: one line per finding, with `file:line` and the issue number.

Fix it in the current change only when the task cannot be finished or verified without it, and say so in the PR description. If you are unsure whether it blocks you, ask.

## Non-negotiable invariants
1. **Nothing bills without the owner's consent.** No paid service and no dependency needing a paid plan,
   unless an ADR records the owner accepting that specific cost and `docs/free-tier-budget.md` records its
   limits and our usage (ADR-0002, amended by ADR-0020). Google Places is the one exception, and it stays
   inert until `GOOGLE_PLACES_KEY` is configured.
2. **Agents only insert** visits and field prospects. Never add an agent-side update of shared data.
3. **Prospect status from visits is computed by the server** (`OUTCOME_TO_STATUS`). Clients never send a derived status.
   A visit the server cannot take — unknown prospect, or a prospect not assigned to the sender — is quarantined in
   `visits_orphaned`, reported in `accepted`, and derives nothing until an admin repairs it (ADR-0022).
4. **Every write is idempotent.** Client ids are `crypto.randomUUID()`. Inserts use `onConflictDoNothing` unless the doc says upsert.
5. **Never lose a visit.** Outbox rows are deleted only after the server lists them in `accepted`. Auth errors and 426 never clear the outbox.
6. **Validate every request body** with a zod schema from `src/shared/schemas.ts`. No inline ad-hoc validation in routes.
   That file is written in **`zod/mini`** (`.check(...)`, `z.optional(x)`, `z._default(x, v)`), not the classic chained
   API — it is reachable from the field entry chunk and the classic runtime costs 17 kB gzipped more (ADR-0017).
7. **D1: ≤100 bound parameters per statement.** Use the `chunk()` helper for multi-row inserts.
8. **Service worker never caches `/api/*`.**
9. **Sync contract changes are additive.** Breaking changes bump `clientVersion` and follow the api.md process.
10. **Identity comes from the verified Access JWT only.** Never read `Cf-Access-Authenticated-User-Email` as proof.
11. **OSM attribution** on every map and export. Overpass is called only from the Worker, through the cache.
12. **`visited_at` is clamped server-side** to `min(visited_at, received_at)`. Phone clocks lie, and a future-dated visit would freeze a prospect's status forever.
13. **Workers Free gives 10 ms CPU per request.** Keep per-request work small: batch imports are 250 rows, the Access JWKS is cached in module scope. Waiting on D1 is free; parsing and validating is not.
14. **`assets.run_worker_first` stays `["/api/*"]`, never `true`.** Static asset requests are free only while they do not invoke the Worker.
15. **French UI, English everything else.** All French strings live in `src/client/copy.ts`; enum values stay English in the database (ADR-0013).

## Code conventions
- TypeScript `strict`, no `any`, no non-null `!` without a comment explaining why.
- Named exports; files `kebab-case.ts`, React components `PascalCase.tsx`.
- `src/shared` holds pure code only (no DOM, no Worker APIs). Both sides import contracts from there; never duplicate a type.
- Routes grouped by domain: `src/worker/routes/<domain>.ts`. Client by domain: `src/client/<domain>/`.
- Timestamps are epoch ms numbers. JSON camelCase, SQL snake_case.
- User-facing copy: sentence case, active verbs, errors say what happened and what to do.
- No new dependency without stating in the PR: size, maintenance, workerd compatibility, and why the platform can't do it.
- User-facing strings are French and live only in `src/client/copy.ts`. Components import from it; they never inline a French literal.
- Styling: Tailwind utilities only, with tokens from the `@theme` block in `src/client/styles/app.css`. No hardcoded colours or spacing, no per-component CSS file.
- Forms: shadcn `form` over react-hook-form, everywhere including the field route (ADR-0018). The resolver reuses an
  existing pure validator or a `z.pick` of the shared schema — never a second copy of the rules. `FormMessage` takes a
  French string from `copy.ts` as children; it never renders zod's English `error.message`. Use `useWatch`, not `watch()`.
- UI: run the `frontend-design` skill to decide a screen before building it, and compose it from shadcn/ui elements vendored into `src/client/ui/`. Never hand-roll an element shadcn provides; translate the English strings a vendored component ships with into `copy.ts` French (ADR-0014). **On the field route only**, a native element may replace a shadcn one whose dependencies breach the 150 kB budget — cite the measurement (ADR-0015).

## Database
- Change `src/worker/db/schema.ts`, then `pnpm db:generate`. Never hand-edit a migration that is already on `main`.
- Migrations must work with the currently deployed Worker (expand/contract). Use the `d1-migration` skill.

## Commands
| Task | Command |
|---|---|
| Dev server | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Tests | `pnpm test` |
| Generate migration | `pnpm db:generate` |
| Apply migrations locally | `pnpm db:migrate:local` |
| Seed the local database | `pnpm db:seed:local` |
| Lint + format check | `pnpm lint` |

**Never run** `wrangler deploy`, anything with `--remote`, or `wrangler secret`. Deploys go through CI only.

## Definition of done
- Typecheck, tests and build pass.
- Docs updated in the same change when behaviour, API or data model changed (`docs/api.md`, `docs/data-model.md`, domain docs).
- New decision → new ADR.
- Commit messages follow Conventional Commits (`feat(field-ops): …`).

## Subagents and skills
- Subagents in `.claude/agents/`: `architect`, `api-engineer`, `pwa-engineer`, `migration-guard`, `security-reviewer`, `docs-keeper`.
- Skills in `.claude/skills/`: `frontend-design`, `new-adr`, `add-api-route`, `d1-migration`, `sync-contract-change`, `overpass-import`, `release-checklist`, `night-shift`.
- The queue for unattended work is `docs/backlog/` — one file per task. A scheduled run implements exactly
  one of them and stops at a pull request: never a merge, never a deploy (ADR-0016, `night-shift`).

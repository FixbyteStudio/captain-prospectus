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

A deferral repeated across two stories with the same reason schedules the enabler story instead of a third deferral (retro epic #59).

## Non-negotiable invariants
Each is one line; its reasons live behind the link.
1. **Nothing bills without the owner's consent.** A paid service or plan needs an ADR and a row in `docs/free-tier-budget.md`. Only Google Places has one, and it stays inert without `GOOGLE_PLACES_KEY` ([ADR-0002](docs/adr/0002-zero-cost-constraint.md), [ADR-0020](docs/adr/0020-google-places-as-a-second-map-provider.md)).
2. **Agents only insert** visits and field prospects; never add an agent-side update of shared data. The server is the only source of truth, and Dexie is a cache plus an outbox ([ADR-0007](docs/adr/0007-offline-first-insert-only-sync.md)).
3. **Prospect status from visits is computed by the server** (`OUTCOME_TO_STATUS`); clients never send a derived status. A visit the server cannot take is quarantined in `visits_orphaned` ([prospecting](docs/domains/prospecting.md#prospect-lifecycle), [ADR-0022](docs/adr/0022-quarantine-visits-the-server-cannot-take.md)).
4. **Every write is idempotent.** Client ids are `crypto.randomUUID()`; inserts use `onConflictDoNothing` unless the doc says upsert.
5. **Never lose a visit.** Outbox rows are deleted only once the server lists them in `accepted`; auth errors and 426 never clear the outbox ([field-operations](docs/domains/field-operations.md#rules)).
6. **Validate every request body** with a zod schema from `src/shared/schemas.ts`, written in **`zod/mini`** (`.check(...)`, `z.optional(x)`, `z._default(x, v)`), never the classic chained API ([ADR-0017](docs/adr/0017-zod-mini-for-the-shared-wire-contract.md)).
7. **D1: ≤100 bound parameters per statement.** Use the `chunk()` helper for multi-row inserts.
8. **Service worker never caches `/api/*`.**
9. **Sync contract changes are additive.** A breaking one bumps `clientVersion` ([api.md](docs/api.md#conventions), `sync-contract-change` skill).
10. **Identity comes from the verified Access JWT only**, never from `Cf-Access-Authenticated-User-Email` ([identity-access](docs/domains/identity-access.md)).
11. **OSM attribution** on every map and export. Overpass is called only from the Worker, through the cache ([ADR-0008](docs/adr/0008-map-import-via-overpass.md)).
12. **`visited_at` is clamped server-side** to `min(visited_at, received_at)` ([prospecting](docs/domains/prospecting.md#prospect-lifecycle)).
13. **10 ms CPU per request** on Workers Free: batch imports are 250 rows, and the Access JWKS is cached in module scope ([free-tier-budget](docs/free-tier-budget.md#watch-outs)).
14. **`assets.run_worker_first` stays `["/api/*"]`, never `true`** ([free-tier-budget](docs/free-tier-budget.md#watch-outs)).
15. **French UI, English everything else.** Every French string lives in `src/client/copy.ts`, and components never inline one. Enum values stay English in the database ([ADR-0013](docs/adr/0013-frontend-conventions.md)).

## Code conventions
- TypeScript `strict`, no `any`, no non-null `!` without a comment explaining why.
- Named exports; files `kebab-case.ts`, React components `PascalCase.tsx`.
- Comments say *why*, in as few lines as it takes. Link the ADR or domain doc instead of restating it; a rule has one home ([ADR-0024](docs/adr/0024-adrs-only-for-hard-to-reverse-decisions.md)).
- `src/shared` holds pure code only (no DOM, no Worker APIs). Both sides import contracts from there; never duplicate a type.
- Routes grouped by domain: `src/worker/routes/<domain>.ts`. Client by domain: `src/client/<domain>/`.
- Timestamps are epoch ms numbers. JSON camelCase, SQL snake_case.
- User-facing copy: sentence case, active verbs, errors say what happened and what to do.
- No new dependency without stating in the PR: size, maintenance, workerd compatibility, and why the platform can't do it.
- Styling: Tailwind utilities only, with tokens from the `@theme` block in `src/client/styles/app.css`. No hardcoded colours or spacing, no per-component CSS file.
- Forms: shadcn `form` over react-hook-form, everywhere including the field route (ADR-0018). The resolver reuses an
  existing pure validator or a `z.pick` of the shared schema — never a second copy of the rules. `FormMessage` takes a
  French string from `copy.ts` as children; it never renders zod's English `error.message`. Use `useWatch`, not `watch()`.
- UI: decide a screen against `docs/design.md` before building it, then compose it from shadcn/ui elements vendored into `src/client/ui/`. Never hand-roll an element shadcn provides; translate the English strings a vendored component ships with into `copy.ts` French (ADR-0014). **On the field route only**, the date input, radios, checkboxes and labels stay native (ADR-0015, ADR-0026), and every PR quotes the precache total against its 1,000 KiB ceiling.

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
- A decision that is hard to reverse → new ADR ([ADR-0024](docs/adr/0024-adrs-only-for-hard-to-reverse-decisions.md) sets the bar). Anything smaller → the PR description and one line in the doc that owns the rule.
- Commit messages follow Conventional Commits (`feat(field-ops): …`).

## Subagents and skills
- Subagents in `.claude/agents/`: `architect`, `api-engineer`, `pwa-engineer`, `migration-guard`, `security-reviewer`, `docs-keeper`.
- Skills in `.claude/skills/`: `new-adr`, `add-api-route`, `d1-migration`, `sync-contract-change`, `overpass-import`, `release-checklist`, `night-shift`.
- The queue for unattended work is `docs/backlog/` — one file per task. A scheduled run implements exactly
  one of them and stops at a pull request: never a merge, never a deploy (ADR-0016, `night-shift`).

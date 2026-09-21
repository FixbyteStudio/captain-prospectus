# CLAUDE.md — rules for AI agents working in this repo

Captain Prospectus: B2B field-canvassing app. Admin imports restaurants/food trucks (CSV or OSM map area) and assigns them; 2 field agents visit them from an offline-first PWA. Read `docs/vision.md` once, `docs/glossary.md` always.

## Stack (decided — see docs/adr)
Vite + React SPA/PWA · Hono on one Cloudflare Worker · D1 + Drizzle · Dexie · Leaflet + Overpass · Cloudflare Access · TypeScript strict · zod.
Do not introduce Next.js, another database, another host, an auth library, or any paid API.

## Before you change anything
1. Architecture, data model, sync, auth, dependencies → read the relevant ADR in `docs/adr/`. If your change contradicts one, stop and propose a new ADR instead.
2. Business rules → read the domain doc in `docs/domains/`. Code must match the doc; if they disagree, ask.
3. Use the glossary's words in code, UI and commits.

## Non-negotiable invariants
1. **Zero cost.** No paid service, no dependency needing a paid plan.
2. **Agents only insert** visits and field prospects. Never add an agent-side update of shared data.
3. **Prospect status from visits is computed by the server** (`OUTCOME_TO_STATUS`). Clients never send a derived status.
4. **Every write is idempotent.** Client ids are `crypto.randomUUID()`. Inserts use `onConflictDoNothing` unless the doc says upsert.
5. **Never lose a visit.** Outbox rows are deleted only after the server lists them in `accepted`. Auth errors and 426 never clear the outbox.
6. **Validate every request body** with a zod schema from `src/shared/schemas.ts`. No inline ad-hoc validation in routes.
7. **D1: ≤100 bound parameters per statement.** Use the `chunk()` helper for multi-row inserts.
8. **Service worker never caches `/api/*`.**
9. **Sync contract changes are additive.** Breaking changes bump `clientVersion` and follow the api.md process.
10. **Identity comes from the verified Access JWT only.** Never read `Cf-Access-Authenticated-User-Email` as proof.
11. **OSM attribution** on every map and export. Overpass is called only from the Worker, through the cache.

## Code conventions
- TypeScript `strict`, no `any`, no non-null `!` without a comment explaining why.
- Named exports; files `kebab-case.ts`, React components `PascalCase.tsx`.
- `src/shared` holds pure code only (no DOM, no Worker APIs). Both sides import contracts from there; never duplicate a type.
- Routes grouped by domain: `src/worker/routes/<domain>.ts`. Client by domain: `src/client/<domain>/`.
- Timestamps are epoch ms numbers. JSON camelCase, SQL snake_case.
- User-facing copy: sentence case, active verbs, errors say what happened and what to do.
- No new dependency without stating in the PR: size, maintenance, workerd compatibility, and why the platform can't do it.

## Database
- Change `src/worker/db/schema.ts`, then `npm run db:generate`. Never hand-edit a migration that is already on `main`.
- Migrations must work with the currently deployed Worker (expand/contract). Use the `d1-migration` skill.

## Commands
| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Tests | `npm test` |
| Generate migration | `npm run db:generate` |
| Apply migrations locally | `npm run db:migrate:local` |

**Never run** `wrangler deploy`, anything with `--remote`, or `wrangler secret`. Deploys go through CI only.

## Definition of done
- Typecheck, tests and build pass.
- Docs updated in the same change when behaviour, API or data model changed (`docs/api.md`, `docs/data-model.md`, domain docs).
- New decision → new ADR.
- Commit messages follow Conventional Commits (`feat(field-ops): …`).

## Subagents and skills
- Subagents in `.claude/agents/`: `architect`, `api-engineer`, `pwa-engineer`, `migration-guard`, `security-reviewer`, `docs-keeper`.
- Skills in `.claude/skills/`: `new-adr`, `add-api-route`, `d1-migration`, `sync-contract-change`, `overpass-import`, `release-checklist`.

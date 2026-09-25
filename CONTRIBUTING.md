# Contributing

## Workflow
Trunk-based. `main` is protected and always deployable.

1. Open or pick an issue. Anything architectural starts as an ADR PR.
2. Branch: `feat/<scope>-<short>`, `fix/…`, `docs/…`, `chore/…`, `refactor/…`.
3. Small PRs (aim < 400 changed lines excluding generated migrations).
4. CI must be green (lint, typecheck, test, build); one review; **squash-merge**.

## Commits
[Conventional Commits](https://www.conventionalcommits.org/). Scopes = domains or layers:
`prospecting`, `ingestion`, `field-ops`, `scripts`, `auth`, `db`, `pwa`, `ci`, `docs`.

```
feat(field-ops): order today list by nearest-next
fix(db): chunk visit inserts under D1 param limit
docs(adr): 0013 add CSV export
```

## Pull request checklist
The PR template enforces it: tests, docs, ADR, migration safety, zero-cost check, sync compatibility.

## Tests
| Layer | What | Tool |
|---|---|---|
| Shared | dedupe key, status mapping, schemas, `chunk()` | Vitest |
| Worker | routes against a real local D1 in workerd | Vitest + `@cloudflare/vitest-pool-workers` |
| Client | sync engine against a mocked API | Vitest + `fake-indexeddb` |
| DOM | the shell's components: routes and frames, sync strip, admin top bar, field tabs | Vitest (`dom` project) + `happy-dom` + Testing Library, `*.test.tsx` |
| E2E | one happy-path visit offline → online | Playwright, added in M2 |

Run everything with `pnpm test`. `pnpm lint` (ESLint + Prettier) runs in CI too.

The package manager is **pnpm** (`packageManager` in `package.json`). CI installs with
`pnpm install --frozen-lockfile`, so commit `pnpm-lock.yaml` with any dependency change.

Sync and dedupe logic must have tests before merge; they are where data gets lost.

## Working with Claude Code
Rules for AI agents are in [CLAUDE.md](CLAUDE.md). Humans follow the same invariants.

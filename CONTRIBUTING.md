# Contributing

## Workflow
Trunk-based. `main` is protected and always deployable.

1. Open or pick an issue. Anything architectural starts as an ADR PR.
2. Branch: `feat/<scope>-<short>`, `fix/…`, `docs/…`, `chore/…`, `refactor/…`.
3. Small PRs (aim < 400 changed lines excluding generated migrations).
4. CI must be green; one review; **squash-merge**.

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

## Tests (strategy)
| Layer | What | Tool (decided at scaffold) |
|---|---|---|
| Shared | dedupe key, status mapping, schemas | unit tests |
| Worker | routes against a local D1 | Workers test runtime |
| Client | sync engine against a mocked API | unit tests |
| E2E | one happy-path visit offline → online | added in M2 |

Sync and dedupe logic must have tests before merge; they are where data gets lost.

## Working with Claude Code
Rules for AI agents are in [CLAUDE.md](CLAUDE.md). Humans follow the same invariants.

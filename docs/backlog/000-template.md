---
id: 000
status: needs-decision
implements: <ADR-00NN, docs/domains/<domain>.md#<anchor>, or roadmap M<n> item>
depends_on: []
---

# <Title as it should appear in the PR>

## Goal

One or two sentences. What exists after this task that did not before, in the
glossary's words.

## Acceptance criteria

- [ ] <Checkable statement — a command, an assertion, a file that must say something>
- [ ] Docs updated: <`docs/api.md` / `docs/data-model.md` / the domain doc> — or "none needed", explicitly
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green

## Out of scope

What a reviewer might expect to see here and will not. Each line is a task that
does not get opened tonight.

## Notes

Anything the implementer would otherwise have to guess: invariants that bite
here, the existing code to follow, the copy keys to add.

---
id: 006
status: ready
implements: ADR-0022
depends_on: []
---

# Point the sync route's assignee comment at ADR-0022, not the superseded ADR-0021

## Goal

`src/worker/routes/agent.ts` no longer cites ADR-0021, which ADR-0022 superseded.
A reader following the comment lands on the rule the code actually implements:
a visit against someone else's prospect is quarantined, not stored.

## Acceptance criteria

- [ ] `src/worker/routes/agent.ts:148` (the JSDoc on `assigneeById`) cites
      `ADR-0022` instead of `ADR-0021`.
- [ ] `grep -rn "ADR-0021" src/` prints nothing.
- [ ] The comments on steps 2 and 3 of `POST /sync` (`agent.ts`, from the
      `// ADR-0022: a visit the server cannot take…` block down to
      `// ---- 3. Derive prospect status…`) still describe quarantine. They already do
      on `main` at the time of writing; if that is still true, change nothing there
      and say so in the PR body.
- [ ] Only comments change: `git diff main --stat` lists `src/worker/routes/agent.ts`
      and the backlog files, and `git diff main -- src/worker/routes/agent.ts` has
      no line outside a comment.
- [ ] Docs updated: none needed (`docs/` already cites ADR-0022).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

## Out of scope

- Rewording any other comment in `agent.ts`, or the `requireSupportedClientVersion`
  comment (that is task 007).
- Editing ADR-0021 or ADR-0022. Accepted ADRs are never edited in place.

## Notes

- Commit: `docs(field-ops): cite ADR-0022 for the sync route's assignee rule`.
- Closes #47

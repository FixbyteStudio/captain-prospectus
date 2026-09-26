---
id: 007
status: ready
implements: docs/free-tier-budget.md#watch-outs (CLAUDE.md INVARIANT 13, 10 ms CPU), docs/api.md#status-codes (426 before 400)
depends_on: []
---

# Parse the sync body once, keeping the 426 check ahead of validation

## Goal

`POST /api/agent/sync`, the route with the largest bodies in the app (up to
`MAX_REQUEST_BYTES`), runs `JSON.parse` on its body once instead of twice. The
order of the checks stays 413, then 426, then 400.

## Why

`requireSupportedClientVersion` (`src/worker/routes/agent.ts`) calls
`c.req.json()` to peek at `clientVersion`. Then `validate("json", syncRequestSchema)`
(`src/worker/validate.ts`, over `@hono/zod-validator`) calls `c.req.json()` again.
In the installed Hono (4.13.x), `req.json()` is
`#cachedBody("text").then(JSON.parse)`: the cache holds the text, not the parsed
value, so every call parses again. The comment above the middleware says
*"Hono caches the parsed body, so this costs no second parse"*, and that is wrong.

## Acceptance criteria

- [ ] The `/sync` chain parses the body exactly once.
      `grep -n "c.req.json()" src/worker/routes/agent.ts` prints at most one line,
      and `/sync` no longer mounts `validate("json", …)`, which would parse a
      second time. How it is done is up to you. A suggested shape: the middleware
      parses, answers 426 when it must, runs `syncRequestSchema.safeParse` on the
      same value, and hands the result on with `c.set(...)`. That needs a
      `Variables` key in `AppEnv` (`src/worker/types.ts`).
- [ ] A body that fails the schema still gets **exactly** the 400 shape every other
      route returns, `{ error: "validation", issues }`. `validate.ts` stays the only
      place that shape is built. Extract a helper there (e.g.
      `validationFailed(c, issues)`) and have both `validate()` and the sync path
      call it. Do not write the shape out a second time.
- [ ] Order is unchanged, and the existing tests in `src/worker/sync.test.ts` still
      pass unedited: "refuses a body over MAX_REQUEST_BYTES before parsing it" (413),
      "answers 426 for a build below the minimum supported version", "rejects a body
      that does not match the schema" and "requires followUpAt when the outcome is
      follow_up" (400).
- [ ] A new case in `sync.test.ts` sends a body that is **both** below
      `MIN_CLIENT_VERSION` **and** invalid for the schema, and asserts 426, not 400.
- [ ] A new case posts `"{"` (malformed JSON, `Content-Type: application/json`)
      and asserts **400**, never 500. Today the middleware swallows the parse error
      and `zValidator` answers with Hono's `HTTPException(400, "Malformed JSON in
      request body")`. Any 400 body is acceptable. Assert the status only, and say
      in the PR which body it now returns.
- [ ] The comment above the middleware no longer claims Hono caches the parsed
      body. It says why the body is parsed once, in as few lines as it takes.
- [ ] `c.req.valid("json")` in the handler is replaced by the value the middleware
      handed on, and it is typed as `SyncRequest` from `src/shared/schemas.ts`,
      not re-declared.
- [ ] Docs updated: none needed. `docs/api.md#status-codes` and
      `docs/domains/field-operations.md` already describe 426-before-400, and the
      behaviour does not change. If the diff changes either one, it is doing more
      than this task.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

## Out of scope

- Any change to the sync request or response shape, `CLIENT_VERSION` or
  `MIN_CLIENT_VERSION`. This is not a sync-contract change; the wire is identical.
- The other routes that use `validate("json", …)`. They parse once already.
- Measuring CPU time. The criterion is one parse, not a benchmark.
- The comment at `agent.ts:148` citing ADR-0021 (task 006).

## Notes

- INVARIANT 6 still holds: the body is validated with `syncRequestSchema` from
  `src/shared/schemas.ts`, only no longer through `zValidator`.
- INVARIANT 5 is why 426 must come before 400. Only a 426 tells the client its
  outbox is fine and it should update. See the existing comment block.
- The 413 check is Hono's `bodyLimit`, mounted in `src/worker/index.ts` ahead of
  every route (`dev.test.ts` pins that). Nothing here should move it.
- Use the `add-api-route` skill's checklist for the route change, even though the
  contract does not move.
- Commit: `perf(field-ops): parse the sync body once`.
- Closes #31

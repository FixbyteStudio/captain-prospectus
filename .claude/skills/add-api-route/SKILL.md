---
name: add-api-route
description: Add or change an endpoint in the Hono Worker API. Use for any new /api route or change to a route's request/response.
---

# Add an API route

1. **Contract first** — in `src/shared/schemas.ts` add the zod schema for the body (with `.max()` caps on strings and arrays) and export the inferred type.
2. **Route file** — `src/worker/routes/<domain>.ts`. Admin routes are mounted behind `requireAdmin` in `index.ts`; agent routes filter every query by `c.get("identity").email`.
3. **Validate** with the `validate(target, schema)` middleware from `src/worker/validate.ts` — `validate("json", …)`, `validate("query", …)`, `validate("param", …)` — then read the result with `c.req.valid(target)`. It is the only place a zod failure becomes a 400.
4. **DB access** through `getDb(c.env.DB)` from `src/worker/db/client.ts`. Multi-row inserts through `chunk(rows, boundParamsPerRow(table))`. Writes idempotent (`onConflictDoNothing`, or `onConflictDoUpdate` on a unique key). A bulk `inArray(...)` binds one parameter per id, so chunk those too.
5. **Errors**: use the status codes in `docs/api.md`. Never leak stack traces.
6. **Tests**: happy path, validation failure, wrong role (403), idempotent retry. Worker tests live beside the code and run against a real D1; see `src/worker/admin.test.ts` for the `call()` helper and the `env.DEV_USER_EMAIL` switch that tests a role.
7. **Docs**: add the row to `docs/api.md`; update the domain doc if behaviour is new.
8. If the route is part of `/api/agent/sync`, also follow `sync-contract-change`.
9. `pnpm typecheck` and tests green.

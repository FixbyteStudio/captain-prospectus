---
name: add-api-route
description: Add or change an endpoint in the Hono Worker API. Use for any new /api route or change to a route's request/response.
---

# Add an API route

1. **Contract first** — in `src/shared/schemas.ts` add the zod schema for the body (with `.max()` caps on strings and arrays) and export the inferred type.
2. **Route file** — `src/worker/routes/<domain>.ts`. Admin routes are mounted behind `requireAdmin`; agent routes filter every query by `c.get("email")`.
3. **Validate** with `parseBody(c, schema)`; return early if it returns a `Response`.
4. **DB access** through `c.get("db")` (Drizzle). Multi-row inserts through `chunk(rows, columnsPerRow)`. Writes idempotent (`onConflictDoNothing` / upsert on a unique key).
5. **Errors**: use the status codes in `docs/api.md`. Never leak stack traces.
6. **Tests**: happy path, validation failure, wrong role, idempotent retry.
7. **Docs**: add the row to `docs/api.md`; update the domain doc if behaviour is new.
8. If the route is part of `/api/agent/sync`, also follow `sync-contract-change`.
9. `npm run typecheck` and tests green.

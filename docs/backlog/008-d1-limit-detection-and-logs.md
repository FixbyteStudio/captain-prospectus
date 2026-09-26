---
id: 008
status: ready
implements: docs/api.md#status-codes (503 when D1's daily limit is hit), docs/security.md#personal-data
depends_on: []
---

# Recognise D1's daily-limit error through Drizzle, and stop logging raw query errors

## Goal

When D1's free-tier daily limit is hit, `onError` in `src/worker/index.ts` answers
the 503 that tells an agent their visits are safe, including when the error
comes through Drizzle. The unhandled-error log line no longer carries SQL, bound
values or a driver message.

## Why

The issue (#37) called the substring match fragile. It is worse than that. Every
query in this Worker goes through Drizzle 0.45. On failure, Drizzle throws a
`DrizzleQueryError` whose `message` is `Failed query: <sql>\nparams: <values>`,
and D1's own error is on `err.cause`
(`node_modules/drizzle-orm/sqlite-core/session.js`, `queryWithCache`). So
`message.includes("free tier daily row")` never sees D1's text: the 503 branch
cannot fire for a Drizzle query. The same message, SQL and bound values
included (visit notes, agent emails), is what `console.error("unhandled error", message)`
sends to Workers observability (`wrangler.jsonc`, `observability.enabled: true`).

D1 exposes **no error code** for this; the issue's suggested fix is not available.
Cloudflare documents the error by its message only
(<https://developers.cloudflare.com/d1/observability/debug-d1/#error-list>):

- `Your account has exceeded D1's free tier daily row read limit. …`
- `Your account has exceeded D1's free tier daily row write limit. …`

## Acceptance criteria

- [ ] A pure function, e.g. `isD1DailyLimitError(err: unknown): boolean` in a new
      `src/worker/errors.ts`, walks `err` and its `cause` chain, stopping after a
      small fixed depth so a cyclic `cause` cannot loop. It returns true when any
      `Error.message` in that chain matches the documented D1 text. Match
      `exceeded D1's free tier daily row (read|write) limit`, not the looser
      `free tier daily row`. The comment links the Cloudflare error list above
      and says there is no error code to match on.
- [ ] `src/worker/errors.test.ts` (worker project) asserts true for both documented
      messages, bare and wrapped as `new DrizzleQueryError(sql, params, cause)`
      (import it from `drizzle-orm`), and false for an unrelated `Error`, a
      non-Error throw, and a `DrizzleQueryError` whose cause is some other D1
      error (e.g. `D1_ERROR: UNIQUE constraint failed`).
- [ ] `onError` uses that function. The 503 body is unchanged:
      `{ error: "quota", message: "Quota quotidien de la base atteint. …" }`.
- [ ] The unhandled-error log line carries **no** `err.message` and no `cause`
      message. It logs a fixed tag, the error's `name` (e.g. `DrizzleQueryError`),
      the cause's `name` if there is one, and the matched route pattern
      (`c.req.routePath`). A test asserts, with `vi.spyOn(console, "error")`, that
      an error thrown with a message containing `"secret-note"` is logged without
      that string anywhere in the call's arguments.
- [ ] A route-level test in `src/worker/errors.test.ts` mounts a throwing handler
      on a Hono app that uses the exported `onError` handler. Or it drives the real
      app some other way, without adding a route to
      `src/worker/routes/admin.ts`. It asserts a wrapped daily-limit error answers
      503 with `error: "quota"`, and any other error answers 500 with
      `error: "internal"`. If `onError` must be exported from `index.ts` to test
      it, export it by name.
- [ ] Docs updated: `docs/security.md#personal-data` gains one line saying the
      Worker's error log carries error names and the route, never messages or
      bound values. `docs/api.md` is **not** edited (see Out of scope).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

## Out of scope

- The 503 `error` code itself. `docs/api.md#status-codes` names it `d1_limit`,
  and the code sends `"quota"`. Which one is right is a separate finding
  (#131). Do not change either here.
- Deciding log retention for Workers observability. That is a roadmap item.
- Other `console.error` calls: the retention sweep's
  (`src/worker/index.ts`, `scheduled`) and any in `routes/`. List them under
  "Found in passing" if they log raw messages too.
- Retrying or backing off on the server. The client already backs off on a 503
  (`src/client/field/sync-schedule.ts`).

## Notes

- Do not add a route to `src/worker/routes/admin.ts` to test this. That file is
  another team's lane this week.
- `err.cause` is typed `unknown`. Narrow it with `instanceof Error`, not a cast.
- Commit: `fix(worker): recognise D1's daily limit through Drizzle and redact error logs`.
- Closes #37

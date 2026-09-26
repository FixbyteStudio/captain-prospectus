---
id: 009
status: ready
implements: docs/architecture.md#tests (the `dom` project)
depends_on: []
---

# Let a DOM test choose the agent's position: denied or positioned

## Goal

The `dom` test project's geolocation shim becomes a fixture a test can set. The
default stays "permission refused", so no existing test changes. A test can ask
for a position instead, and `useAgentPosition`'s positioned path gets its first
test.

## Why

happy-dom declares `navigator.geolocation` but leaves it `null`.
`test/setup-dom.ts` papers over that with a shim that always refuses. That keeps
the suite from crashing, but it also means no DOM test can reach the success
callback in `src/client/field/useAgentPosition.ts`. Deleting its `setPoint(…)`
line passes CI today.

## Acceptance criteria

- [ ] A new `test/geolocation.ts` exports a setter, e.g.
      `setGeolocation(fix: "denied" | { lat: number; lng: number })`, and a
      `resetGeolocation()` that restores `"denied"`.
- [ ] `test/setup-dom.ts` installs the shim **unconditionally** (not inside
      `if (!navigator.geolocation)`), reading its answer from that fixture. It
      calls `resetGeolocation()` in its existing `afterEach`, so one test's position
      never leaks into the next.
- [ ] `getCurrentPosition` in the shim calls the success callback with a
      `GeolocationPosition`-shaped object (`coords.latitude`, `coords.longitude`,
      `timestamp`) when a position is set, and the error callback with
      `{ code: 1 }` when denied. Answer asynchronously (`queueMicrotask` or
      `setTimeout(…, 0)`), as a browser does, so the hook's `locating: true`
      state is observable.
- [ ] A new `src/client/field/useAgentPosition.test.tsx` (dom project, `renderHook`
      from `@testing-library/react`) asserts:
      - positioned: `locating` is true first, then `point` equals the fixture's
        `{ lat, lng }`, `denied` is false and `locating` is false;
      - denied (the default): `point` is null, `denied` is true;
      - `refresh()` after switching the fixture from denied to a position yields
        that position and clears `denied`;
      - unmounting before the reading lands neither throws nor logs: a
        `vi.spyOn(console, "error")` records no call once the microtask has run.
        React 19 no longer warns about a state update after unmount, so this
        pins only that the `cancelled` guard does not crash. Say that in the
        test's comment.
- [ ] Mutation check: temporarily deleting `setPoint(...)` in
      `useAgentPosition.ts` makes the positioned case fail. Say in the PR that you
      ran it, and do not commit the deletion.
- [ ] No existing `*.test.tsx` changes. `git diff main --stat -- 'src/**/*.test.tsx'`
      lists only the new file.
- [ ] Docs updated: `docs/architecture.md#tests`: the paragraph under the table
      that lists what the `dom` project stubs gains one sentence naming
      `test/geolocation.ts` and its "denied by default" rule.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:precache` green.

## Out of scope

- **Any change to `src/client/field/useAgentPosition.ts`** or any field screen
  (`TodayScreen.tsx`, `VisitScreen.tsx`, `AddProspectScreen.tsx`). Epic 4's
  stories (#118 Tournée du jour, #127 Ajouter) are rebuilding those screens and
  their position states right now. This task only makes them testable.
- A `watchPosition` path. The issue mentions one, but the hook deliberately
  never watches (see its header comment and `docs/vision.md`'s non-goal on
  continuous tracking). The shim's `watchPosition` stays a no-op.
- Screen-level tests that render a field screen with a position. Those belong
  to the epic 4 stories, which can now use the fixture.

## Notes

- Timing: if a test uses fake timers, answer with `queueMicrotask`, not
  `setTimeout`, so `waitFor` still resolves. Choose one and say which in the
  PR.
- `Object.defineProperty(navigator, "geolocation", { configurable: true, value })`
  is how the shim is installed today. Keep `configurable: true`.
- Commit: `test(field-ops): let DOM tests set the agent's position`.
- Closes #87

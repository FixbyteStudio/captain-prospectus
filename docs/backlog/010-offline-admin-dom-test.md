---
id: 010
status: done
implements: docs/domains/identity-access.md#offline-and-session-expiry
depends_on: []
---

# Pin that an offline admin opens the field side, with no Tableau de bord tab

**Superseded by #115** (spec-gh-115-admin-tab-offline): the DOM cases this
task asked for — a cache-started admin's `/` redirect, its `/admin` deep
link, and its missing tab — are covered by `App.test.tsx`'s new cases, built
against `adminAccess` rather than the `isAdmin` this task's own acceptance
criteria named. Its mutation check (deleting `&& !fromCache`) is #115's own
acceptance criterion. The acceptance criteria below are kept as filed, for the
record, and are themselves superseded — they still name `isAdmin`,
`me.role === "admin"` and `/admin/prospects`, none of which exist after #115;
do not implement them as written.

## Goal

A DOM test renders the app shell for an admin whose identity comes from the
Dexie cache because `/api/me` is unreachable. It asserts they land on the field
frame without the dashboard tab. Deleting `&& !offline` from `isAdmin` in
`src/client/App.tsx` then fails CI.

## Why

`isAdmin` (`src/client/App.tsx`, `const isAdmin = me.role === "admin" && !offline;`)
is what keeps an offline admin out of admin screens that cannot work without
the network. The pure half is tested (`src/client/field/identity.test.ts`); the
rendered half is not. The other half of #85, the identity-error screen, was
covered since the issue was filed: `App.test.tsx`, "draws the band in the
identity-error frame", asserts `copy.errors.offlineFirstRun`. This task does
not repeat it.

## Acceptance criteria

- [ ] `src/client/App.test.tsx` gains, in `describe("App routing")`, a case
      "sends an offline admin from / to the round, in the field frame". It seeds
      `fieldDb.meta` with an **admin** identity (`setMeta(fieldDb, "identity", …)`
      from `src/client/field/db.ts`, awaited before render), sets
      `stub.identityUnreachable = true`, renders `/`, and asserts:
      - `screen.getByTestId("pathname")` reads `/tournee`;
      - the field band's tab nav (`fieldBand()`) is present;
      - `screen.queryByTestId("admin-frame")` is null;
      - no link named `copy.nav.tabs.dashboard` is rendered
        (`screen.queryByRole("link", { name: copy.nav.tabs.dashboard })` is null).
- [ ] A second case renders `/admin/prospects` under the same conditions and
      asserts the forbidden state inside the field frame, the same assertion the
      existing "answers an agent on an admin route with the forbidden state…"
      case uses. An offline admin deep-linking to an admin page gets the field
      side's answer, not a blank admin frame.
- [ ] Mutation check: temporarily changing `isAdmin` to `me.role === "admin"` makes
      both new cases fail. Say in the PR that you ran it, and do not commit the
      change.
- [ ] The new cases survive the suite's cleanup rules. The `beforeEach` comment
      explains that `App`'s identity effect writes `meta.identity` unawaited.
      With `offline: true` it does not write (`App.tsx`, `if (!outcome.offline)`),
      but the seeded row must still be cleared by the existing `afterEach`. Run
      `pnpm vitest run --project dom src/client/App.test.tsx` three times and
      quote that it passed each time.
- [ ] **No production file changes.** `git diff main --stat` lists only
      `src/client/App.test.tsx` and the backlog files.
- [ ] Docs updated: none needed. `docs/domains/identity-access.md` already states
      the rule; this pins it.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:precache` green.

## Out of scope

- The identity-error screen. It is already covered, see Why.
- The 401 (revoked) path's rendered screen. A separate test if anyone wants it;
  `identity.test.ts` covers the decision.
- Any change to `App.tsx`, `FieldTabs.tsx` or the field screens. Epic 2 (#107
  makes Tableau de bord the `/admin` index) and epic 4 are changing the shell's
  routes this week. If the admin redirect target has moved from
  `/admin/prospects` by the time this runs, assert against whatever `App.tsx` on
  `main` says and note it in the PR.

## Notes

- Existing helpers in `App.test.tsx`: `renderApp(path)`, `fieldBand()`, the
  hoisted `stub`, and the `./admin/AdminApp` mock that renders
  `data-testid="admin-frame"`.
- The admin fixture: `{ email: "admin@example.com", role: "admin" }` typed as
  `MeResponse`, like the existing `AGENT` constant.
- Expect a textual merge conflict in `App.test.tsx` if #107 lands first and adds
  cases there. Rebase; do not reorder existing cases.
- Commit: `test(identity): pin the offline admin's field frame`.
- Closes #85

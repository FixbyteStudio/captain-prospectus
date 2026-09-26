---
id: 011
status: ready
implements: docs/architecture.md#tests (the `dom` project covers "the admin top bar's controls")
depends_on: []
---

# Pin the admin top bar's remaining handlers with DOM tests

## Goal

Each admin top-bar handler that can be deleted today with CI still green gets a
test in `src/client/admin/TopBar.test.tsx`:

- the theme toggle following the system live while unpinned;
- both search buttons opening the palette;
- ⌘K opening it through the real `keydown` listener.

## Acceptance criteria

- [ ] **Theme follows the system while unpinned** (`ThemeToggle.tsx`, the
      `useEffect` that registers a `matchMedia` `change` listener). Stub
      `window.matchMedia` with an object that records the listener passed to
      `addEventListener`. Render with nothing pinned
      (`document.documentElement.dataset.theme` unset) and the system light. Call
      the recorded listener with `{ matches: true }` inside `act(...)`, then assert
      the button's name is now `copy.theme.toLight`.
- [ ] **A pin beats the system.** Same stub, but first click the toggle to pin
      dark. Fire `{ matches: false }` and assert the name stays `copy.theme.toLight`
      and `dataset.theme` stays `"dark"`.
- [ ] **The listener is removed on unmount.** After `unmount()`, the stub's
      `removeEventListener` was called with the same function `addEventListener`
      got.
- [ ] **Both search buttons open the palette** (`SearchPalette.tsx`, the two
      `<Button onClick={() => setOpen(true)}>`). The wide one and the icon one
      share the accessible name `copy.search.button`, and happy-dom applies no
      breakpoint CSS, so both are in the tree. For each of
      `screen.getAllByRole("button", { name: copy.search.button })`, click it in
      its own render and assert `findByRole("dialog")` contains
      `copy.search.unavailable`. The array must have length 2; assert that too, so
      a removed button fails rather than shrinking the loop.
- [ ] **⌘K through the DOM.** `user.keyboard("{Meta>}k{/Meta}")` opens the dialog,
      alongside the existing Ctrl+K case. `nav.test.ts` already covers
      `isPaletteShortcut`'s `metaKey` branch as a pure function; this pins the
      listener passing the event through.
- [ ] Mutation checks, each run once and reported in the PR, none committed:
      removing `mql.addEventListener("change", onChange)` fails the first case;
      removing either button's `onClick` fails the search case; replacing
      `isPaletteShortcut(event)` in the listener with
      `event.ctrlKey && event.key === "k"` fails the ⌘K case.
- [ ] **No production file changes.** `git diff main --stat` lists only
      `src/client/admin/TopBar.test.tsx` and the backlog files.
- [ ] Docs updated: none needed.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:precache` green.

## Out of scope

- **The field tab bar's leave dialog** (Escape or overlay click closes it
  without navigating, `src/client/field/FieldTabs.tsx`, its `onOpenChange`).
  That is the other half of #86. It is left out on purpose: epic 4's #121
  (Carte: lazy map and tab) is changing `FieldTabs` and its test file this
  week, and the night shift stays out of that lane. #86 stays open for it.
- Any change to `ThemeToggle.tsx`, `SearchPalette.tsx`, `TopBar.tsx` or `nav.ts`.
- New tests in `nav.test.ts`; its pure cases are already complete.

## Notes

- The first existing case in `TopBar.test.tsx` shows the `matchMedia` stub
  shape (`vi.spyOn(window, "matchMedia").mockReturnValue({...} as unknown as MediaQueryList)`).
  Extend it to capture the listener rather than writing a second stub style.
- Reset `document.documentElement.dataset.theme` between cases if the file does
  not already; a pin from one case must not reach the next.
- Commit: `test(admin): pin the top bar's theme, search and ⌘K handlers`.
- Part of #86. It does **not** close it: the `FieldTabs` leave-dialog half
  remains, see Out of scope. Write `Refs #86` in the PR, not `Closes`.

# ADR-0014: Tailwind CSS and shadcn/ui for the interface

- Status: accepted — decision 2 amended by [ADR-0015](0015-native-controls-on-the-field-route.md) and [ADR-0026](0026-budget-the-field-precache-not-the-entry-chunk.md) for the field route only: its date input, radios, checkboxes and labels stay native. Decisions 1, 3, 4 and 5 stand, and decision 2 stands in full on the admin route.
- Date: 2026-09-21
- Deciders: owner

## Context

[ADR-0013](0013-frontend-conventions.md) chose plain CSS with custom properties,
reasoning that ~8 screens share little visual language and that the field client
must stay small on a bad connection. That reasoning held for a scaffold with
placeholder screens. It does not survive contact with the real ones:

- The admin side is dense — tables, filters, bulk selection, a column-mapping
  step for CSV import, a script editor. Those need dialogs, comboboxes, toasts
  and data tables. Hand-rolling them *accessibly* (focus traps, keyboard
  navigation, ARIA) is a large amount of work that is easy to get subtly wrong.
- The field side is the opposite — few controls, large touch targets — but it
  still needs the same date picker, select and toast as the admin side.
- The owner wants a deliberate visual direction rather than default-looking
  screens, applied consistently across both sides.

shadcn/ui is not a component dependency in the usual sense: its CLI copies
component source into the repository, so we own and can edit the result. It
does require Tailwind CSS v4, Radix UI primitives, and the small
`class-variance-authority` / `clsx` / `tailwind-merge` trio.

All of it is MIT-licensed, installs from npm, runs in the browser only and is
never imported by `src/worker` or `src/shared`, so [ADR-0002](0002-zero-cost-constraint.md)
(zero cost) and workerd compatibility are both unaffected.

## Decision

We will style the client with **Tailwind CSS v4** and build interface elements
from **shadcn/ui** components vendored into `src/client/ui/`.

1. **Design tokens live in Tailwind's `@theme`**, replacing
   `src/client/styles/tokens.css`. One source of truth for colour, spacing and
   type, still editable in one file.
2. **Elements come from shadcn.** A button, dialog, select, table, toast or
   date picker is added with the shadcn CLI and then owned by us. We do not
   hand-roll an element shadcn already provides, and we do not add a second
   component library.
3. **Screens are designed before they are built.** Any new screen, or a
   material reshape of an existing one, is decided against `docs/design.md`
   and written up there first, so the visual direction is decided
   deliberately rather than emerging from defaults.
4. **The French copy rule is unchanged.** shadcn components ship English
   strings; every user-visible string is replaced from `src/client/copy.ts`
   (INVARIANT 15). A French literal inside a vendored component is still a bug.
5. **Touch targets stay honest.** shadcn defaults are sized for a mouse. Field
   screens keep the 48px minimum target from ADR-0013; the variant that does
   this lives in the vendored component, not re-declared per screen.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep plain CSS (ADR-0013 as written) | Means hand-writing accessible dialogs, comboboxes and a data table. That is the bulk of M1 and M3, and accessibility bugs there are invisible until someone hits them with a keyboard |
| Radix primitives with our own CSS, no Tailwind | Keeps the CSS approach and still solves accessibility, but gives up shadcn's ready-made compositions and leaves us maintaining a styling layer by hand. Adds a dependency without the payoff |
| MUI or Mantine | Heavier runtime shipped to a phone on a bad connection, and opinionated theming we would fight to get a non-default look |
| Tailwind alone, no shadcn | Solves consistency but not accessibility: Tailwind styles elements, it does not implement a focus-trapped dialog |

## Consequences

- **ADR-0013's styling decision is superseded.** Its other two decisions stand
  unchanged: French UI with all strings in `copy.ts`, and TanStack Query on the
  admin side only.
- **CLAUDE.md's "no CSS framework" rule is replaced** by "no CSS framework
  other than Tailwind, and no component library other than shadcn".
- **New dependencies**, all client-only and MIT: `tailwindcss` +
  `@tailwindcss/vite`, `class-variance-authority`, `clsx`, `tailwind-merge`,
  `lucide-react`, and one `@radix-ui/react-*` package per component actually
  used. The shadcn CLI is run with `pnpm dlx`, not installed.
- **The bundle grows**, and the field client is the one that matters. Measure it
  at the end of M2 against the "usable on a bad connection" goal in
  [vision.md](../vision.md); if the field route's JS exceeds a budget we set
  there, split the admin and field bundles by route before adding more.
- **Vendored components are our code.** They are reviewed like our code, and
  they do not update themselves — a shadcn upstream fix has to be pulled in
  deliberately.
- `src/client/styles/app.css` and `tokens.css` need migrating in the same change
  that introduces Tailwind, not left alongside it.

# ADR-0026: Budget the field route by its precache, not its entry chunk

- Status: proposed
- Date: 2026-09-24
- Deciders: mohss, Claude
- Supersedes: the 150 kB budget in [vision.md](../vision.md) and its use in [ADR-0015](0015-native-controls-on-the-field-route.md)

## Context

The field route has had one size rule since [ADR-0014](0014-tailwind-and-shadcn-ui.md): **the entry
chunk stays under 150 kB gzipped**. [ADR-0015](0015-native-controls-on-the-field-route.md) hung its
native controls on that number: a shadcn component could replace a native one only once a
measurement showed the room for it.

The dashboard redesign adds five things to the field route:

| Addition | Lands in | Brings |
|---|---|---|
| Carte tab: Leaflet map of the round | a lazy chunk (the screen is a route) | Leaflet and its CSS |
| Bottom tab bar | the entry chunk (it is the shell) | four Lucide icons |
| Swipe actions on stops | the entry chunk | a pointer handler, no library |
| Save-confirmation sheet or dialog | the lazy visit chunk | shadcn Dialog, so Radix Dialog |
| Daily progress and new copy | the entry chunk | a few strings in `copy.ts` |

Measured with `pnpm build`:

| | Entry chunk (gzip) | Precache |
|---|---|---|
| `main` on 2026-09-24 | 145.33 kB | 609.58 KiB, 14 entries |
| Spike: lazy Carte with Leaflet, Dialog in the visit chunk, four tab icons | 144.49 kB | 811.75 KiB, 19 entries |

The spike was a throwaway build, not a branch. It leaves out the swipe handler and the copy, which
are small. What it shows:

- **The entry chunk barely moves.** The redesign's weight goes to lazy chunks, so the 150 kB number
  would still pass, and it would say nothing about a phone downloading 202 KiB more.
- **The precache is where the cost lands.** The service worker precaches every field chunk so the
  app works offline, so an install or an update downloads them all. vision.md,
  [ADR-0018](0018-one-form-stack.md) and [ADR-0019](0019-admin-chunk-out-of-the-precache.md) each
  record the same fact: a lazy chunk defers bytes, it does not save them.
- **Leaflet (148.72 kB raw) and Radix Dialog (37.30 kB raw) become chunks shared with the admin
  side.** ADR-0019's glob ignores only `AdminApp-*`, so a shared chunk is precached. That is correct
  here, because the field route now needs both offline.

A phone downloads the precache on a bad connection, when it installs the app and whenever an update
lands. After that the app opens from the cache, so the entry chunk costs parse time, not download.

Nothing enforces either number today. CI runs `pnpm build` but checks no size; each milestone reads
the figures by hand into vision.md.

[ADR-0002](0002-zero-cost-constraint.md) is untouched. No service is added, and Leaflet and the
vendored Dialog are already dependencies of the admin side.

## Decision

We will **budget the field route by its precache total: at most 1,000 KiB**, as `pnpm build` prints
it on the Workbox line (`precache N entries (X KiB)`). The ceiling is the spike's 811.75 KiB plus
20 %, rounded up to the next 50 KiB.

- **The entry chunk loses its cap.** It is still measured and recorded in vision.md with every field
  change, because it is parse time on a cheap phone.
- **Carte loads as a lazy field chunk and stays precached**, so the Carte tab can show its offline
  notice and the next stop with no signal.
- **ADR-0015's native controls stay, on their own merit rather than for size.** The field route keeps
  `<input type="date">`, the native radio and checkbox controls in `src/client/ui/field-controls.tsx`,
  and the plain `<label>`. On a phone the OS date wheel, 48 px native radios and the browser's own
  label association are the better controls, and they need no library. Every other field element
  defaults to its shadcn component, as [ADR-0014](0014-tailwind-and-shadcn-ui.md) decision 2 says,
  and that includes Dialog and Sheet.

## Alternatives considered

| Option | Why not |
|---|---|
| Raise the entry-chunk number (e.g. to 175 kB) | It keeps measuring the wrong thing. The spike passes 150 kB already, and the budget would still say nothing about the 202 KiB a phone now downloads |
| Replace bytes with a timed target ("Tournée du jour interactive within N s on a throttled mid-range Android") | Closer to the goal, but nothing in the repo can measure it, and a rule nobody can check is not a budget |
| No budget, only record both numbers | Nothing would bound what an agent downloads on install, which is the cost this budget has protected since ADR-0014 |
| Keep 150 kB and fit the redesign into it | The number is met, so this keeps the rule and loses its purpose. It would also keep ADR-0015's "cite a measurement" test on every shadcn component, to defend a figure that no longer tracks the download |
| Leave the Carte chunk out of the precache, like ADR-0019's admin chunk | The Carte tab could not render its offline notice or the next stop without a network, and the round's map is a field screen, not an admin one |

## Consequences

- **A phone downloads about a third more on install:** 811.75 KiB against 609.58 KiB, measured. The
  ceiling leaves about 188 KiB of room from there.
- **The first paint of Tournée du jour is no longer capped.** A field screen that bloats the entry
  chunk now only shows up in the recorded number, so review has to read it.
- **Harder: the ceiling is still read by hand.** It is a line in `pnpm build`'s output, not a failing
  check. A CI step that fails over 1,000 KiB is follow-up work, not part of this change.
- **Every PR that touches the field route quotes the precache total and the entry chunk**, and
  vision.md records them at each milestone, as it has since ADR-0018.
- **ADR-0019's glob keeps its known gap in reverse.** A chunk shared by admin and field is precached,
  which is right for Leaflet and Radix Dialog. A chunk only the admin needs that does not start with
  `AdminApp-` is precached too, and counts against this ceiling.
- **`docs/design.md`'s field sections still quote the old budget** ("~5 kB gzipped the field route
  does not have", "Native controls here"). They are rewritten from the redesign spines in their own
  change.
- **Code comments that cite ADR-0015's measurements stay true as history** (`field-controls.tsx`,
  `label.tsx`, `button-variants.ts`, `BackLink.tsx`). The redesign's build changes revisit Lucide and
  Radix Slot on the field side against this ceiling.

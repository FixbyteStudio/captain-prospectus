# Design

The visual system. [ADR-0014](adr/0014-tailwind-and-shadcn-ui.md) decided *how*
we build the interface (Tailwind v4, shadcn/ui vendored into `src/client/ui/`);
this file records *what it looks like* and why, so a screen built in M3 matches
one built in M1.

Tokens live in the `@theme` block of `src/client/styles/app.css`. That file is
the implementation; this one is the reasoning. If they disagree, the CSS is
right and this file needs updating.

## Grounding

The artifact this app replaces is a **carnet de tournée** — a route notebook: a
list of addresses, ticks, and scribbled outcomes. The mark is a ship's wheel
around a map pin: a captain plotting a round. Navy and gold come from it, and
they suit the ledger — navy is ink, gold is what you are steering towards.

So the admin side is a **ledger, not a dashboard**. Ruled, dense, numeric. No
cards around rows, no tiles, no gradient washes, no zebra striping. The field
side is the ticket torn out of that notebook — few controls, large targets — and
gets its own design pass in M2 (ADR-0014, decision 3).

## Colour

The brand: **navy `#1b2a4a`** and **gold `#c9a227`**, taken from the mark — a
ship's wheel and a map pin — and the off-white `#f6f7f0` it sits on. Navy is the
ink and the band. Gold is the primary action and nothing else.

| Role | Light | Dark |
|---|---|---|
| `background` (page) | `#F6F7F0` | `#101726` |
| `card` (table, panels) | `#FFFFFF` | `#182031` |
| `foreground` (ink) | `#1B2A4A` | `#E7EAF0` |
| `muted-foreground` | `#5A6478` | `#97A2B8` |
| `border` (hairlines) | `#D7DAE2` | `#2B3547` |
| `primary` (the action) | `#C9A227` | `#D9B43C` |
| `primary-foreground` | `#1B2A4A` | `#141C2E` |
| `primary-edge` (its border) | `#A8801A` | `#E6C65C` |
| `ring` (focus) | `#1B2A4A` | `#E7EAF0` |
| `success` (`converted`) | `#1F6F4A` | `#4FA97D` |
| `warn` (`follow_up`) | `#9A6B12` | `#D98A3C` |
| `destructive` (`rejected`) | `#8C2F39` | `#D2757E` |
| `band` (top bar) | `#1B2A4A` | `#0B1120` |

### What gold may and may not do

Three rules, each forced by a measurement rather than taste. They are asserted in
`src/client/styles/palette.test.ts`, so nudging a hex fails CI.

- **Gold is never text on a light surface.** It is 2.4:1 on white. It is a fill,
  with navy on top at 5.9:1 — and navy, not white, which would be 2.4:1.
- **Gold is never the focus ring.** A ring needs 3:1 against what it sits on and
  gold gives 2.4:1, so `--color-ring` points at the ink. This is the one place
  shadcn's default wiring (`ring` follows `primary`) had to be broken.
- **A gold button needs its own edge.** The fill is 2.2:1 against the page, below
  the 3:1 WCAG 1.4.11 wants for a control's boundary, so the `default` button
  variant carries `border-primary-edge` — a darker gold at 3.4:1.

`converted` has its own `success` token rather than following `primary`, because
a gold `converted` would sit **7°** in hue from the mustard that means
`follow_up` and the two would stop being separable. Gold and mustard do share a
screen — a gold button above a column of `À relancer` rows. If that ever reads
muddy, `--warn` moves to `#9A5B18`, which is 5.4:1 and 15° clear.

Dark follows the system by default and can be pinned with `data-theme` on
`<html>`. Tokens swap their *values*, so components rarely need a `dark:`
utility; the variant exists for the few that do.

## Status is read down the left edge

The admin's real question is "which of these has nobody been to?". So each
ledger row carries a 4px leading edge keyed to its status, painted as an inset
shadow on the first cell. Scanning the edge answers that question without
reading a word.

| Status | Edge token | Label colour |
|---|---|---|
| `new` | `status-new` — 16% ink | `muted-foreground` |
| `assigned` | `status-assigned` — 55% ink | `foreground` |
| `follow_up` | `status-follow-up` — `warn` | `warn` |
| `converted` | `status-converted` — `success` | `success` |
| `rejected` | `status-rejected` — `destructive` | `destructive` |

Two rules this encodes, both deliberate:

- **Colour never carries the information alone.** The French label from
  `STATUS_LABELS` is always in its column too.
- **`assigned` must not outshout `converted`.** It is a mid-neutral, not full
  ink. The first version used full ink and `assigned` became the loudest thing
  in the column, which put "someone owes a visit" above "we won this one".

## Type

One family: **Archivo Variable**, latin subset, **weight axis only** — a single
35 KB woff2, self-hosted, declared as one `@font-face` in `app.css`.

The width axis was considered and cut: it is 90 KB for the same glyphs, and the
field PWA pays that on a phone with bad signal (vision.md) to buy a subtle width
shift on about three strings. Display type takes its character from weight and
tracking instead.

Importing the fontsource stylesheet would emit every subset, and Workbox's
`globPatterns` precaches every `woff2` it finds — hence the hand-written
`@font-face` naming one file. Latin alone covers French, including œ (U+0153).

| Size | Tailwind | Use |
|---|---|---|
| `0.75rem` | `text-xs` | meta, help text, table header |
| `0.875rem` | `text-sm` | body, table cells — the default |
| `1rem` | `text-base` | form inputs; 16px so iOS never zooms the field form |
| `1.25rem` | `text-xl` | screen title |
| `1.75rem` | `text-display` | counts and tallies |

**Numbers are tabular and right-aligned, always.** The `.tnum` utility exists for
this. It is the single thing that makes a table read as a ledger rather than a
table widget, and it matters for counts, dates and distances alike.

## Layout

A thin ink band with the wordmark and the nav, then full-width content. No left
rail — three admin screens do not earn that much chrome, and one shell serves
both the admin and the field side rather than two.

Safe-area insets go on `.safe-top` (the band) and `.safe-bottom` (the content),
never on `body`, so the band stays flush with the top of a notched phone.

### One toolbar slot

Above a list there is exactly one slot. It holds the filters; the moment
anything is selected it is **replaced in place** by the actions — same position,
same height, no floating bar, no layout shift. Its contents always answer "what
can I do right now".

```
│ Statut ▾   Agent ▾   Source ▾                412 prospects │   nothing selected
│ 12 sélectionnés   [Assigner à ▾]  [Désassigner]    Annuler │   selection
```

## Principles

1. The list is the product. Chrome yields to rows.
2. Status is structural before it is textual.
3. One toolbar slot.
4. Numbers are tabular and right-aligned.
5. Motion only where something changed — the toolbar swap, a row settling after
   assign. Nothing fades in on scroll, nothing animates on hover by default.

## Not this

Choices rejected on purpose, recorded so they do not creep back in: cards around
rows; zebra striping; a uniform soft shadow under everything; status as a
coloured pill; tracked-out ALL-CAPS eyebrow labels above headings; `01 / 02 / 03`
step markers on things that are not sequences; `→` appended to button text; meta
strings joined with middle dots; a monospace face for figures — the variable
font's tabular numerals do that job.

## Writing

Covered by CLAUDE.md and the [glossary](glossary.md): sentence case, active
verbs, French in `src/client/copy.ts` only. Two habits worth naming here:

- An action keeps its name through the whole flow. The button that says
  « Assigner » produces a result that says « Assigné ».
- An empty screen is an invitation, not a shrug: « Aucun prospect. Importez un
  CSV pour commencer. », with the button right there.

## Working with shadcn in this repo

Two things the CLI gets wrong here, both worth knowing before the next
`pnpm dlx shadcn@latest add`:

- It resolves the `@` alias from the **root `tsconfig.json`**, which is an empty
  stub that compiles nothing. The `paths` entry there exists only for the CLI;
  without it, components are written to a literal `./@/ui/` directory.
- Recent versions import `cn` from an npm package of that name rather than from
  the `utils` alias. Repoint them at `@/lib/utils` and do not keep the package —
  we already have that function.

Vendored components are our code (ADR-0014): they are linted and formatted like
everything else, their `"use client"` directives are stripped because nothing
here is Next.js, and `sonner.tsx` reads the theme from `data-theme` rather than
carrying `next-themes` for it.

They also arrive roomier than this design wants. The ledger sets its own row
height from `--spacing-row` and zeroes the cell padding shadcn ships.

## Icons

Everything in `public/` is copied verbatim to the site root by Vite, so these
names are also the URLs. Drop the files in with exactly these names and nothing
else needs editing:

| File | Size | Why |
|---|---|---|
| `favicon.ico` | 48×48 + 32×32 | The browser tab. |
| `mark.svg` | scalable | The mark in the band, with its navy swapped for the band's foreground — a navy wheel on a navy band is 1:1. |
| `apple-touch-icon.png` | 180×180 | The iOS home screen. iOS ignores the manifest's icons for this, so without it an agent's iPhone renders a screenshot of the page. |
| `icon-192.png` | 192×192 | Android install prompt. |
| `icon-512.png` | 512×512 | Android splash screen. |
| `icon-maskable-512.png` | 512×512 | Android adaptive icons, which crop to a circle or squircle. |

Two things to get right in the artwork:

- **The maskable one needs a safe zone.** Android crops it to a shape it chooses,
  so the mark has to sit inside the central 80% — a circle of 40% radius from the
  centre — and the rest must be filled background, not transparency. A normal
  icon reused here gets its edges cut off.
- **The others should not be transparent either.** A transparent PNG on the iOS
  home screen renders on black. Use the brand off-white `#F6F7F0` or navy
  `#1B2A4A`, matching the manifest's `background_color` and `theme_color`.

An installable PWA needs at least the 192 and the 512; a manifest with no icons
gets no install prompt, and "agents install the PWA from the phone browser"
(roadmap M6) fails silently. All six files exist, and `index.html` and the
manifest in `vite.config.ts` reference them — verified by having a browser parse
the built manifest rather than by reading it.

`favicon.svg` is deliberately **not** in `public/`. It lives in `docs/brand/`
because it is a 246 kB PNG wrapped in an SVG, and the service worker precaches
every svg it finds under `public/` — one file larger than the whole field JS
chunk, for a tab icon the `.ico` already serves.

## The field side

The admin side is a ledger. The field side is **the tear-off** — the ticket
pulled out of the *carnet de tournée* and held in one hand.

Everything below is designed for one situation: an agent standing on a pavement
in Lyon, phone in one hand and a stack of flyers in the other, sun on the
screen, often with no signal, wanting to be done with this door and on to the
next. That situation, not the admin's, decides every trade-off here.

The palette and the typeface are not re-decided for this side. Tokens are shared
(`app.css`), the mark is shared, the band is shared. What changes is **density,
target size, and how much the screen commits to one thing at a time.**

### The next stop is the screen

Nearest-next ordering means the first item in the list is not a row — it is an
instruction. So it is given the width, the space and the actions, and the rest
of the round is a quiet ledger beneath it.

```
┌──────────────────────────────────┐
│ ▮ Captain Prospectus        ● 3  │  band: mark, wordmark, sync state
├──────────────────────────────────┤
│ Hors ligne. Vos visites sont…    │  strip: only when there is something to say
├──────────────────────────────────┤
│                                  │
│ ▎1  Le Bouchon des Filles        │
│     Restaurant                   │
│     12 rue Sainte-Catherine      │
│                           120 m  │
│     ┌─────────┐  ┌────────────┐  │
│     │ Y aller │  │  Visiter   │  │  48 px; « Visiter » is the gold one
│     └─────────┘  └────────────┘  │
│                                  │
├──────────────────────────────────┤
│ ▎2  Café de la Poste      340 m  │
│ ▎3  Chez Marcel           410 m  │  the rest of the round: compact rows
│ ▎4  Pizzeria Vesuvio      820 m  │
│                                  │
│  Plus tard                       │
│ ▎  Le Comptoir          18 sept. │  future follow-ups, subordinate
└──────────────────────────────────┘
```

**The stops are numbered, and here that is earned.** Numbered markers are
usually decoration pretending to be structure — but `orderByNearestNext`
produces a walking order, so this list genuinely *is* a sequence, and "I am on
my fourth of eleven" is something an agent wants to know. The number sits in the
left gutter beside the status edge, tabular and muted.

**No card around the next stop.** It is set apart by space and by being the only
thing carrying actions — not by a box, a shadow or a different radius. The
"Not this" list above still applies on this side.

### One decision per screen

The today list asks *which door*. The visit form asks *what happened*. Nothing
else is allowed to compete.

```
┌──────────────────────────────────┐
│ ←  Le Bouchon des Filles         │
├──────────────────────────────────┤
│  Flyer remis               [ ●]  │
├──────────────────────────────────┤
│  Résultat                        │
│  ┌────────────────────────────┐  │
│  │ Personne sur place         │  │
│  ├────────────────────────────┤  │
│  │ Intéressé                  │  │  five targets, 56 px, full width
│  ├────────────────────────────┤  │
│  │ Pas intéressé              │  │
│  ├────────────────────────────┤  │
│  │ À relancer                 │  │
│  ├────────────────────────────┤  │
│  │ Converti                   │  │
│  └────────────────────────────┘  │
│                                  │
│  Relancer le   [ 29/09/2026 ]    │  only when the outcome is « À relancer »
│                                  │
│  Notes                           │
│  ┌────────────────────────────┐  │
│  └────────────────────────────┘  │
│                                  │
│  Visites précédentes             │
│  12 sept.            Intéressé   │
├──────────────────────────────────┤
│  [   Enregistrer la visite   ]   │  sticky above the safe-area inset
└──────────────────────────────────┘
```

The outcome list takes an unreasonable share of the screen on purpose. It is the
one thing the whole app exists to capture, and it has to be hittable by a thumb
without the agent looking carefully. Five stacked full-width targets, not a
select and not a grid of chips.

**The form never shows what the outcome will do to the prospect's status.** That
mapping is the server's (INVARIANT 3, `OUTCOME_TO_STATUS`), and a client that
previews it is a client that can disagree with it. The new status arrives on the
next sync, in the list.

### Adding a place

```
│  Nom      [                    ] │
│                                  │
│  Type                            │
│  [ Restaurant ] [ Restauration ] │  six targets, wrapping
│  [ Café ] [ Bar ] [ Food truck ] │
│  [ Autre ]                       │
│                                  │
│  Position                        │
│  45,7578  4,8320     Actualiser  │  or « Utiliser ma position »
│                                  │
│  [          Ajouter          ]   │
```

### Sync is ambient, never a toast

An agent's sync state is a **condition, not an event**. "Three visits waiting to
send" stays true for as long as there is no signal — sometimes hours. A toast
shows it for four seconds and then lies by omission.

So sync lives in two permanent places:

- **A dot and a count in the band**, always visible, on every field screen.
- **A strip under the band** that appears only when there is something to say —
  the pending count, or one of `copy.sync.offline` / `authExpired` / `upgrade` /
  `failed`. When nothing is pending and the last sync succeeded, there is no
  strip at all.

This is a deliberate departure from the roadmap's "a shadcn `sonner` toast on
failure". A toast is the wrong medium for a persistent condition, and it costs
~5 kB gzipped the field route does not have (ADR-0015). `sonner` stays on the
admin side, where the events it reports really are events.

### Field principles

These extend the five above; they do not replace them.

6. **One decision per screen.** If a screen asks two questions, it is two
   screens.
7. **The next stop is the screen.** The round is context; the next door is the
   content.
8. **Ambient over transient.** A condition that lasts is shown as a standing
   fact. Toasts are for things that happened and are over.
9. **Thumb, not cursor.** 48 px minimum, 56 px for the outcome. Set in the
   vendored component's variant (ADR-0014 decision 5), never per screen.
10. **Legible in sun, at arm's length.** Field body text is `text-base`, one
    step up from the admin's `text-sm`. Inputs are `text-base` too, which also
    stops iOS zooming the form.

### Not this, on the field side

Further to the list above, and for the same reason — so they do not creep back:

- A bottom tab bar. Three screens, one of which is reached from a row, do not
  earn permanent chrome at the bottom of a phone.
- A map on the today list. That is M4, and even then it is not the default view:
  an agent standing in the street can already see the street.
- A progress ring, a streak, or "7 visites aujourd'hui". This is a job, not a
  fitness app, and the count that matters is the one still unsent.
- Swipe-to-action on a row. Invisible, undiscoverable, and wrong when one hand
  is holding flyers.
- A confirmation dialog on saving a visit. Visits are append-only and a mistake
  is corrected by a second visit (ADR-0007); a dialog would buy nothing and cost
  a tap in the rain.

### Native controls here

`<input type="date">` for the follow-up date, and the choice controls in
`src/client/ui/field-controls.tsx` rather than Radix's — a native radio group is
not behaviour the platform lacks. That is
[ADR-0015](adr/0015-native-controls-on-the-field-route.md), and it is a
measurement before it is a preference.

**Validation is react-hook-form, here as everywhere else**
([ADR-0018](adr/0018-one-form-stack.md)). That reverses half of ADR-0015 —
deliberately, with its own measurement, because M3's script questions are a
variable list whose rules depend on the outcome. The rules themselves did not
move into the components: the visit form's resolver *is* `toVisit` from
`visit-draft.ts`, and the add-prospect form's is `z.pick` of the shared schema.
What changed is who tracks which control is invalid, not who decides.

The consequence to expect: **the date field looks like the operating system, not
like the admin's controls.** That is not an inconsistency to fix later. On a
phone the OS picker is one thumb, correctly localised and correctly sized at any
text scale, and it costs nothing to download.

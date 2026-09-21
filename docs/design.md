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
list of addresses, ticks, and scribbled outcomes. The places in it are French
food businesses: the deep green of a brasserie facade, the pewter of *le zinc*.

So the admin side is a **ledger, not a dashboard**. Ruled, dense, numeric. No
cards around rows, no tiles, no gradient washes, no zebra striping. The field
side is the ticket torn out of that notebook — few controls, large targets — and
gets its own design pass in M2 (ADR-0014, decision 3).

## Colour

Cool zinc neutrals, deliberately away from the warm-cream palette that generated
interfaces default to. The accent is the `#1F6F4A` already fixed as the PWA's
`theme_color` in `index.html` and the manifest.

| Role | Light | Dark |
|---|---|---|
| `background` (page) | `#F0F2F1` | `#121815` |
| `card` (table, panels) | `#FFFFFF` | `#19211D` |
| `foreground` (ink) | `#16211C` | `#E6EBE8` |
| `muted-foreground` | `#56635D` | `#94A29B` |
| `border` (hairlines) | `#D5DCD8` | `#2C3832` |
| `primary` (action, `converted`) | `#1F6F4A` | `#4FA97D` |
| `warn` (`follow_up`) | `#9A6B12` | `#D4A23E` |
| `destructive` (`rejected`) | `#8C2F39` | `#D2757E` |
| `band` (top bar) | `#16211C` | `#0C1310` |

The three chromatic values clear 4.5:1 on their surface in both themes. `ink` is
a green-black rather than a tinted grey — it sits in the accent's hue family, so
the neutrals and the accent read as one palette rather than two.

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
| `converted` | `status-converted` — `primary` | `primary` |
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

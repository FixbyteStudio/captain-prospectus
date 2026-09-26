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
they suit the app — navy is the ink, gold is where you are heading.

The app has **two faces with one palette and one typeface**:

- **The admin side is a dashboard**, a quiet version of the shadcn SaaS
  dashboard: a navy sidebar holds the navigation, and the figures that say how
  canvassing is going (KPI cards, charts) come before the tables and queues
  under them. It is built for a laptop and still works on a tablet or a phone.
- **The field side is the page torn out of that notebook.** An agent on a
  Brussels pavement, phone in one hand and flyers in the other, sun on the
  screen, often no signal. It keeps the admin's tokens under a navy band, with
  bigger type, bigger targets and one decision per screen.

The system is shadcn/ui ([ADR-0014](adr/0014-tailwind-and-shadcn-ui.md)); this
file specifies only the brand layer on top of shadcn's defaults: the colours,
one typeface, a slightly tighter radius, and the app's own components.

Layout and every section after it still describe today's shell and screens;
each is rewritten as it adopts this system.

## Colour

The brand: **navy `#1b2a4a`** and **gold `#c9a227`**, taken from the mark, and
the off-white `#f6f7f0` it sits on. Navy is the ink and the band. Gold has two
jobs and no others: it marks **the main action** on a view (Visiter,
Enregistrer, Importer…) and **what is selected** (the current sidebar item and
tab, the chosen outcome card or answer, the next stop). Gold is always a fill,
with navy on top and a `primary-edge` border.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F6F7F0` | `#101726` | The page |
| `card` | `#FFFFFF` | `#182031` | Cards, tables, sheets, dialogs |
| `foreground` | `#1B2A4A` | `#E7EAF0` | The ink: text and icons |
| `secondary` (also `muted`, `accent`) | `#E8EAEF` | `#222B3D` | Secondary buttons, icon tiles, skeletons, unselected choices |
| `muted-foreground` | `#5A6478` | `#97A2B8` | Meta text, help text, column headers |
| `border` (also `input`) | `#D7DAE2` | `#2B3547` | Hairlines |
| `primary` (gold) | `#C9A227` | `#D9B43C` | The main action and what is selected, as a fill |
| `primary-foreground` | `#1B2A4A` | `#141C2E` | Text on gold |
| `primary-edge` | `#A8801A` | `#E6C65C` | The border of every gold fill |
| `ring` | `#1B2A4A` | `#E7EAF0` | The focus ring |
| `success` | `#1F6F4A` | `#4FA97D` | `converted`, an upward delta |
| `warn` | `#9A5B18` | `#D98A3C` | `follow_up`, waiting to send, count pills |
| `destructive` | `#8C2F39` | `#D2757E` | `rejected`, a downward delta, delete |
| `on-destructive` (utility `destructive-foreground`) | `#FFFFFF` | `#141C2E` | Text on a `destructive` or `warn` fill |
| `band` | `#1B2A4A` | `#0B1120` | The admin sidebar and the field band |
| `band-foreground` | `#EEF0F4` | `#E7EAF0` | Text on the band |
| `band-muted` | `#95A0B8` | `#7D899F` | Quieter text on the band, sidebar group labels |
| `band-accent` | `#FFFFFF14` | `#FFFFFF0F` | Hover wash on the band (white at 8 % / 6 %) |
| `band-border` | `#FFFFFF1F` | `#FFFFFF14` | Hairlines on the band (white at 12 % / 8 %) |
| `band-strip` | `#142038` | `#070B15` | The sync strip: the band, one step darker |
| `status-new` | 16 % ink | 16 % ink | The `new` row edge |
| `status-assigned` | 55 % ink | 55 % ink | The `assigned` row edge |
| `outcome-no-contact` | `#8A92A4` | `#7C87A0` | `no_contact` in charts |
| `outcome-interested` | `#2E3F63` | `#AEBBDB` | `interested` in charts and badges |
| `outcome-not-interested` | `#5B5F63` | `#8E9399` | `not_interested` in charts |

The outcome colours are admin-only: the stacked visits chart and the outcome
badges. `follow_up` and `converted` outcomes reuse `warn` and `success`. The
field visit form never shows them; its outcome cards stay neutral until one is
chosen, so the phone never previews the status an outcome leads to.

Deltas are `success` when up and `destructive` when down, always with an arrow
and a signed figure. No colour carries a meaning alone: a status, outcome,
delta or sync state always has its French label too.

`warn` moved from `#9A6B12` to `#9A5B18` because the old mustard gave 4.0:1 on
its own 12 % badge tint, failing rule 5. The new one is 5.4:1 on white, 4.6:1 on
its tint, and 15° in hue clear of the gold.

### Badges

A status or outcome badge is a small tinted rectangle (`rounded-sm`, meta type)
with the French label. The fill is the badge's colour mixed **at most 12 %**
into the card, as a `tint-*` token (`color-mix(in oklab, <colour> N%,
var(--card))`).

| Badge | Text | Fill |
|---|---|---|
| Nouveau (`new`) | `muted-foreground` | `secondary` |
| Assigné (`assigned`) | `foreground` | `tint-assigned`: 7 % ink, i.e. 12 % of the 55 % edge, kept opaque |
| À relancer (`follow_up`) | `warn` | `tint-warn` |
| Converti (`converted`) | `success` | `tint-success` |
| Refusé (`rejected`) | `destructive` | `tint-destructive`: 12 % light, 10 % dark |
| Personne sur place (`no_contact`) | `muted-foreground` | `secondary` |
| Intéressé (`interested`) | `outcome-interested` | `tint-outcome-interested` |
| Pas intéressé (`not_interested`) | `foreground` | `tint-outcome-not-interested` |

`converted` has its own `success` token and is **always green**. A gold
`converted` would sit 7° in hue from the mustard that means `follow_up`, and
the two would stop being separable.

### The six rules

Each is forced by a measurement rather than taste.
`src/client/styles/palette.test.ts` asserts the tokens behind each rule in
light, in dark pinned with `data-theme`, and in dark from the system: nudging a
hex so that one breaks fails CI and names the theme. A second tier scans every
class string in `src/client` (excluding tests) for rule 4 (a `bg-primary` fill
with no `primary-edge` boundary under the same variant-prefix chain, or one
that applies whenever it does — `dark:` stacked on top of an already-guarded
state, say) and for rule 2's destructive pairing (`text-white`, or a dimmed
`bg-destructive/NN` fill under any prefix chain except a transient `hover:`
one, which makes the asserted ink-on-`destructive` pair vacuous) — GH #67,
after both slipped past the token tier once each (#69, #70). Rule 1 stays a
usage rule, kept in review: nothing scans arbitrary component markup for gold
text on a light surface.

1. **Gold is never text on a light surface.** It is 2.4:1 on white. This keeps
   every word legible: gold only ever says "act here" or "chosen" as a fill.
2. **Text on gold is navy, never white.** Navy gives 5.9:1; white gives 2.4:1.
   This keeps the main action's label readable in the sun.
3. **Gold is never the focus ring; `ring` is the ink.** A ring needs 3:1
   against what it sits on and gold gives 2.4:1, so a gold ring would vanish
   exactly where keyboard users need it. This is the one place shadcn's default
   wiring (`ring` follows `primary`) is broken.
4. **Every gold fill carries `primary-edge`.** The fill is 2.2:1 against the
   page, below the 3:1 WCAG 1.4.11 wants for a control's boundary; the darker
   gold edge gives 3.4:1 and still reads as gold. `progress.tsx`'s indicator
   bar carries it too (an inset shadow, since the track's `overflow-hidden`
   already clips it to the rounded shape).
5. **Status and outcome badge text reaches 4.5:1 on its tint.** This keeps a
   badge's word legible, not just its colour. A tint that fails drops below 12 %
   in that theme until it passes, which is why dark `tint-destructive` is 10 %.
6. **Every outcome colour clears 3:1 on its theme's card.** A chart series is a
   graphical object (WCAG 1.4.11), so each of the five, `warn` and `success`
   included, must stand out from the card it is drawn on. Series are not 3:1
   against each other and never will be: five mutually distinct colours would
   need an 81:1 luminance range, and sRGB has 21:1 (#91). The stacked chart
   separates neighbours structurally instead.

Gold text on the navy band is allowed, because the band is not a light surface.

Dark follows the system by default and can be pinned with `data-theme` on
`<html>`. Tokens swap their *values*, so components rarely need a `dark:`
utility; the variant exists for the few that do. The two dark blocks in
`app.css` must stay identical, which the test also checks. The admin top
bar's Sun/Moon toggle (GH #64) is what pins it: a click stores the chosen
theme in `localStorage` and writes it straight to `data-theme`, with no route
back to "system"; a classic `<script>` in `index.html` applies a stored pin
before first paint, so a pinned-dark reload never flashes light. The field
side reads the same pin through that boot script.

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
35 KB woff2, self-hosted, declared as one `@font-face` in `app.css`. There is
no second family and no monospace: coordinates, CSV headers and script keys are
Archivo with tabular figures too.

The width axis was considered and cut: it is 90 KB for the same glyphs, and the
field PWA pays that on a phone with bad signal (vision.md) to buy a subtle width
shift on about three strings. Display type takes its character from weight and
tracking instead.

Importing the fontsource stylesheet would emit every subset, and Workbox's
`globPatterns` precaches every `woff2` it finds — hence the hand-written
`@font-face` naming one file. Latin alone covers French, including œ (U+0153).

Each role is a `--text-*` token carrying its size, line height, tracking and
weight, so one utility sets all four; an explicit `font-*` utility still wins.

| Role | Token | Size / weight | Use |
|---|---|---|---|
| Display | `text-display` | 28px / 700 | KPI figures, import tallies |
| Title | `text-title` | 20px / 600 | Screen titles, the prospect name on a visit |
| Heading | `text-heading` | 16px / 600 | Card and panel titles, the next stop's name on a phone |
| Body (field) | `text-body-field` | 16px / 400 | All field text and **every input on both sides**, so iOS never zooms |
| Body | `text-body` | 14px / 400 | Admin body text and table cells (the admin default) |
| Label | `text-label` | 14px / 500 | Buttons, nav items, form labels |
| Meta | `text-meta` | 12px / 500 | Timestamps, secondary lines, badges, tab labels |
| Overline | `text-overline` | 12px / 500, 0.06em | KPI labels, column headers, sidebar group labels |

The overline is rendered uppercase by the component (`uppercase`); its string
in `copy.ts` stays in sentence case. The token is `text-overline` because
Tailwind's bare `overline` utility is a text decoration.

**Numbers use tabular figures (`.tnum`), always**: counts, dates, times,
distances, percentages and coordinates. In tables, quantities are
right-aligned; time columns are left-aligned, because they are read down as a
sequence rather than compared. Figures are formatted for fr-FR: "1 284",
"10,6 %", "24/09/2026 15:24", "350 m", "1,4 km".

## Layout

The admin side has a navy sidebar (GH #63): **Pilotage** (Tableau de bord),
**Prospects** (Prospects, Import, Doublons) and **Terrain** (Visites, À
rattacher, Scripts), each item a 36px row
with an icon and a label, group labels in the overline style. The current item
is a gold fill with navy text and a `primary-edge` inset; item text otherwise
stays `band-foreground` in every state, including the `band-accent` hover
wash — `band-muted` is for group labels only, which never take the wash.
Tableau de bord lives at `/admin` itself, so it matches exactly (`end`): it is
current on `/admin` and never on a path under it. An `/admin/*` path no route
knows shows "Page introuvable." inside the admin frame. The
width follows the viewport: full (`16rem`) at ≥ 1024px, an icon rail (`3rem`)
from 768 to 1023px with a Tooltip naming each item, and a Sheet drawer below
768px behind a menu button in the top bar. Doublons and À rattacher carry a
`warn` pill badge — a dot on the icon in the rail — shown only when their
count is above zero and their query has not failed; the count always equals
what their own screen lists, because both read the same query. The two sides
share the band's look and tokens, but each owns its frame: the admin frame
(sidebar and top bar) ships in the admin chunk, and the field band carries the
sync state.

The top bar (GH #64) sits beside the sidebar toggle, left to right: the
breadcrumb, a flexible gap, search, the notifications bell, the theme toggle
and the avatar menu. The breadcrumb reads "Captain Prospectus › {group} ›
{page}" at ≥ 1024px, "{group} › {page}" from 768 to 1023px, and just "{page}"
in semibold below 768px — `NAV_GROUPS` and `isCurrent` supply the group and
page, so it can never name one the sidebar disagrees with; a path outside
every group (a route this epic has not shipped a sidebar entry for) falls back
to the app name alone. Search is a 240px outlined button from 768px
("Rechercher un prospect…", with a shortcut hint) and an icon button below
that; the button and ⌘K/Ctrl+K open a shadcn `CommandDialog` whose only
content is its input and an explanatory empty state — there is no back end
yet, and no request is made. The bell is a disabled icon button with no
content. The avatar is initials on `primary` with a `primary-edge` ring,
opening a `DropdownMenu` with the signed-in email and "Se déconnecter", a real
anchor to `/cdn-cgi/access/logout` rather than a router link — see
[identity-access.md](domains/identity-access.md) for why.

Safe-area insets go on `.safe-top` (the band) and `.safe-bottom` (the field's
bottommost fixed element — the tab bar below 768px, GH #66), never on `body`,
so the band stays flush with the top of a notched phone and the tab bar stays
flush with the bottom. Both live in `app.css`'s `@layer utilities`, not
`@layer base`: Tailwind v4 orders `utilities` after `base`, so a plain `py-*`
there always wins over the inset (GH #80). A `<main>` that needs both its own
bottom margin and the inset — everywhere a screen is not directly above the
tab bar — uses `.pb-page` instead of stacking `.safe-bottom` and `pb-6` on one
element, which cannot own `padding-bottom` twice.

### Tableau de bord

`/admin` opens here (GH #107). It says how canvassing is going over the last 7,
30 or 90 days; every figure is defined once, in [api.md › The
dashboard](api.md#the-dashboard), and the Worker computes it.

- **Header.** The title (`text-title`) and "Où en est la prospection." on the
  left; on the right the period selector, a shadcn `ToggleGroup` of "7 jours",
  "30 jours", "90 jours" on a `secondary` track, the chosen one lifted onto
  `card` with a shadow — a segmented control, not a gold fill. 30 is the
  default, and pressing the chosen period again keeps it. It is the only
  selector on the screen. It wraps under the title on a phone.
- **KPI card.** A shadcn `Card` with no coloured edge — on this app an edge
  means a status. Top to bottom: the label in `text-overline` with a 32px
  `secondary` icon tile at the top right (Lucide `Store` for Prospects
  ouverts, `MapPin` for Visites), the figure in `text-display` with tabular
  figures, then the delta chip and "vs période précédente" in meta. The chip
  is a `rounded-sm` Badge: `tint-success` with an up arrow when the rounded
  delta is up, `tint-destructive` with a down arrow when it is down, and
  neutral `secondary` with no arrow for "0,0 %" and for "—" (no previous
  period). The figure is signed, with a real minus: "+12,4 %", "−3,0 %".
  Prospects ouverts is a snapshot, so it has no delta row; an empty row of
  the same height keeps its figure level with its neighbours'.
- **Grid.** Cards are 4 across at ≥ lg, 2 × 2 at md and one column below,
  24px apart. Only Prospects ouverts and Visites exist so far; the stories
  that add figures add cards to the same grid.
- **Loading.** Skeleton cards of the same shape stand in until the first
  answer, with a visually hidden "Chargement du tableau de bord…". Switching
  period keeps the last period's cards on screen, dimmed, until the new
  figures land — never back to skeletons.
- **Failure.** An inline destructive Alert, "Impossible de charger le tableau
  de bord.", with a "Réessayer" button that refetches, in place of the cards.
- **Freshness.** No polling yet. Every admin mutation marks the dashboard's
  query stale (`createAdminQueryClient`), so it refetches as soon as it is on
  screen, whatever `staleTime` a later story sets.

### One toolbar slot

Above a list there is exactly one slot. It holds the filters; the moment
anything is selected it is **replaced in place** by the actions — same position,
same height, no floating bar, no layout shift. Its contents always answer "what
can I do right now".

```
│ Statut ▾   Agent ▾   Source ▾                412 prospects │   nothing selected
│ 12 sélectionnés   [Assigner à ▾]  [Désassigner]    Annuler │   selection
```

### The script editor

The roadmap calls this "the most complex screen in the app" — a variable-length
list of typed questions, reorderable, versioned, and read by both the admin
composing it and (later, M3's next PR) the agent answering it. It stays a
**ledger**, not a form wizard: one dense editor, no steps, no cards.

```
┌──────────────────────────────────────────────────────┬──────────────────┐
│ Scripts                                                │                  │
│ Le questionnaire posé à chaque visite. L'enregistrement│                  │
│ crée une nouvelle version et l'active aussitôt…        │                  │
├──────────────────────────────────────────────────────┤  Versions        │
│ Nom du script   [ default                    ]         │ ┌──────────────┐│
│                                                          │ │ Version 3    ││
│ Questions                          [+ Ajouter une       │ │ Active       ││
│                                        question]         │ │ 4 questions  ││
│ ┌──────────────────────────────────────────────────┐   │ ├──────────────┤│
│ │⠿ 1  Proposez-vous la livraison ?              [🗑]│   │ │ Version 2    ││
│ │     Oui / non          ☐ Obligatoire               │   │ │ Inactive     ││
│ │     clé  has_delivery                              │   │ │ 3 questions  ││
│ ├──────────────────────────────────────────────────┤   │ └──────────────┘│
│ │⠿ 2  Quel système de caisse utilisez-vous ?    [🗑]│   │                  │
│ │     Choix unique       ☐ Obligatoire               │   │                  │
│ │     Aucun · Papier · Autre        [+ Ajouter un    │   │                  │
│ │                                       choix]        │   │                  │
│ │     clé  pos_system 🔒  Modifier la clé            │   │                  │
│ └──────────────────────────────────────────────────┘   │                  │
│                                                          │                  │
│           L'enregistrement crée une nouvelle version    │                  │
│           et l'active immédiatement.                    │                  │
│                    [ Enregistrer une nouvelle version ] │                  │
└──────────────────────────────────────────────────────┴──────────────────┘
```

Five rules this encodes:

- **No card, drag handle instead of a shadow.** A question is a row in a
  bordered, divided list — `⠿` (a `GripVerticalIcon`) is the only affordance
  that says "reorder me", never a raised surface. Same rule as the prospect
  table: chrome yields to content.
- **A saved key locks.** A question copied in from the active version arrives
  with `🔒` and a disabled key field — docs/domains/scripts.md: keys are
  "stable, and never reused with a different meaning", and an answer already
  recorded under `pos_system` must stay findable under that key. Unlocking is
  one explicit click (**Modifier la clé**), never a default state, and it
  prints a standing warning once unlocked rather than a one-time toast, since
  the risk (silently orphaning old answers) outlives a four-second message. A
  brand-new question's key is suggested from its label as it is typed and
  stays editable until the admin edits it by hand.
- **One primary action, and it gets a confirmation.** Every other admin screen
  in this app avoids a confirmation dialog — a merge, an assignment, a status
  change are all either reversible or additive. Saving a script is neither: it
  silently reassigns what every agent is asked next, including mid-round, and
  it is not append-only the way a visit is (compare "no confirmation dialog on
  saving a visit" on the field side — that rule exists *because* a visit is
  append-only and this action is not). So Save opens a dialog stating the
  version number it is about to create and activate, and that is the only
  place a confirmation dialog appears in this app.
- **Version history is a fact, not a feature.** The list on the right shows
  every version with its question count and Active/Inactive, in text — bold
  and `success`-toned for active, muted for inactive — never a coloured pill
  (same rule as the prospect ledger's status column). Nothing there is
  clickable in this PR; restoring an old version as a starting point is not a
  rule the domain doc states, so it is not built.
- **Reorder works from a keyboard.** `@dnd-kit`'s `KeyboardSensor` with
  `sortableKeyboardCoordinates` is wired alongside the pointer sensor, so
  Tab-to-the-handle-then-arrow-keys reorders a script exactly like a drag does.
  A drag-only list here would be the same accessibility regression ADR-0015
  already refuses on the field route, just on the admin side instead.

### The map import

The map is a **source, not a screen**. `ingestion.md` opens with "two sources,
one pipeline", and the band already carries six links — so drawing an area is a
first step inside **Import**, not a seventh nav item:

```
Source → Fichier → Colonnes → Aperçu     CSV
Source → Carte                            carte
```

Step one asks one question, « D'où viennent les prospects ? », and the two
answers are a file and a map. After that the CSV path is untouched.

**Which map provider is a choice inside the map step, not a third answer here**
(ADR-0020). The fork is about where the data comes from *as a workflow* — a
spreadsheet or a canvas — and OpenStreetMap and Google are the same workflow. A
three-way source step would also make the admin pick a provider before seeing a
map, which is the one moment they have no information to pick with.

The map path is one screen, because the polygon and the result are the same
question asked twice:

```
┌────────────────────────────────────┬─────────────────────────────┐
│ Données [ OpenStreetMap        ▾]  │ 47 lieux trouvés            │
│ Gratuit et sans limite. Couver…    │                             │
│                                    │ 6 sans nom                  │
│         [ Leaflet canvas ]         ├─────────────────────────────┤
│                                    │ L'Estaminet       Restaurant│
│          ·———·———·                 │ 12 rue des Bouchers         │
│         /         \                │ Chez Marcel       Café      │
│        ·           ·               │ 3 place Saint-Géry          │
│         \____·____/                │ ⌁ Sans nom        Bar       │
│                                    │   4 rue Neuve               │
│  © les contributeurs OpenStreetMap │ …                           │
├────────────────────────────────────┼─────────────────────────────┤
│ 7 sommets   [Annuler le dernier]   │                             │
│             [Effacer]              │ [ Importer 41 prospects ]   │
│        [ Rechercher dans la zone ] │                             │
└────────────────────────────────────┴─────────────────────────────┘
```

And on the Google provider, the same screen with a circle:

```
┌────────────────────────────────────┬─────────────────────────────┐
│ Données [ Google Places        ▾]  │ 20 lieux trouvés            │
│ Chaque recherche Google compte…    │ ⚠ Google renvoie 20 lieux   │
│                                    │   au maximum…               │
│         [ Leaflet canvas ]         ├─────────────────────────────┤
│                                    │ L'Estaminet       Restaurant│
│              ╭───────╮             │ Rue des Bouchers 12, 1000   │
│             │    ·    ●            │ Café du Sablon        Café  │
│              ╰───────╯             │ Rue de Rollebeek 9, 1000    │
│                                    │ …                           │
│  © les contributeurs OpenStreetMap │ Résultats fournis par Google│
├────────────────────────────────────┼─────────────────────────────┤
│ Rayon 300 m · Faites glisser…      │                             │
│                     [Effacer]      │ [ Importer 20 prospects ]   │
│        [ Rechercher dans la zone ] │                             │
└────────────────────────────────────┴─────────────────────────────┘
```

Eight rules this encodes, and four more for the second provider:

- **Side by side, because the list is the verdict on the polygon.** A wizard
  step would hide the map at the moment the admin learns the area was wrong.
  Here a thin result — or forty restaurants from the wrong arrondissement — is
  answered by moving a vertex and searching again, with both halves on screen.
  This is the one admin screen where two things compete for attention on
  purpose; the split is the point.
- **Leaflet owns the canvas, and nothing else.** Every control around it is
  shadcn (roadmap). The map has no Leaflet zoom buttons styled to look like
  ours and no custom toolbar inside the canvas: the actions sit under it, in the
  screen's own language.
- **One toolbar slot, under the map.** Same rule as §128, applied to a half
  screen: vertex count on the left as a standing fact, the search action on the
  right. It is never a floating bar over the canvas.
- **The candidate list is a ledger, not a preview table.** It reuses the leading
  edge — `status-new` for a place that will be imported, `status-rejected` for
  one that cannot be — so the panel scans the same way the prospect list does,
  at half the width. No cards, no checkboxes-as-chrome.
- **A place without a name is shown and inert.** OSM has plenty of unnamed
  amenities, and `ingestion.md` asks for them to be visible so the admin can see
  what the area really holds. But `name` is required by `importRowSchema`, so an
  unnamed candidate cannot be imported: it is listed greyed, struck, with
  « Sans nom » as its reason — exactly how the CSV preview renders a rejected
  line — and the import count excludes it. Naming one inline is a real feature
  and not this one.
- **Attribution is Leaflet's own control, not our chrome.** `copy.attribution`
  is passed to the tile layer's `attribution` option, so it moves with the map
  and cannot be laid out away by accident (INVARIANT 11).
- **Drawing is pointer-only, and that is stated rather than hidden.** Placing a
  vertex is a click; Leaflet gives keyboard pan and zoom but no keyboard vertex.
  The mitigation is that **the CSV path is fully keyboard-reachable and imports
  the same prospects** — the source step is the accessible fork, not an
  afterthought. Making the polygon keyboard-editable is worth doing and is not
  in M4.
- **A cached answer says so.** Overpass results are cached seven days
  (ADR-0008); a result served from cache says « Résultat en cache » with its
  age, because "I searched twice and got the same 47" should be explainable
  without reading the Worker.
- **The candidate list is bounded and scrolls, and the live feed's is not.**
  That looks like two answers to one question; it is one answer to two. Here the
  two halves have to stay aligned or the split stops working — a hundred results
  in an unbounded list would push the map off screen, and "move a vertex and
  search again" is exactly what the admin does while reading them. The feed has
  no second column to stay level with, so it takes the page's own scrollbar.

Four more, from ADR-0020:

- **The provider sits above the map, not in the toolbar under it.** The toolbar is
  one slot and it holds actions; the provider is not an action, it decides what
  the canvas *is*. Putting it above keeps the §128 rule intact and puts the choice
  before the thing it changes, in reading order.
- **The gesture follows the API, and the API is why.** Overpass takes a polygon
  and Google takes a circle, so the canvas draws a polygon or a circle. The first
  click on an empty circle canvas places one at a small default radius rather than
  leaving a lone pin: a click that produces no visible shape reads as a map that
  swallowed it. The second click sets the radius, and two handles — centre and
  east — move or resize it afterwards, the same grab-a-dot grammar as a vertex.
  « Annuler le dernier point » is hidden for a circle, which has no history to
  walk back.
- **Changing the provider starts the drawing over.** A polygon is not a circle, and
  the previous provider's results left beside a blank canvas would read as an
  answer about the new one. This is the one control on the screen that discards
  work, which is why it is a select the admin opens deliberately and not a toggle.
- **Cost is a standing fact, not a warning.** Under the choice, in the muted
  register the sync indicator uses: « Chaque recherche Google compte dans le quota
  mensuel. 20 lieux maximum par cercle. » It is true for hours, it changes what
  the admin draws next, and an alert would be shouting about something nothing has
  gone wrong with. The truncation message is different — it is a result, so it is
  an `Alert` beside the results it describes. And a missing key is neither: it
  says that nobody configured the provider and that OpenStreetMap is right there,
  because « Google n'a pas répondu » would send the admin to refresh a page that
  will never work.

### The live feed

The roadmap sketched this as shadcn `card` + `badge` + `scroll-area`. **It is a
ledger instead**, for the reason at the top of this file: no cards around rows,
no status as a coloured pill. The feed is the prospect list with time as its
spine.

```
│ Visites                                        47 visites      │
├────────────────────────────────────────────────────────────────┤
│ 16:42  Le Bouchon          Intéressé      flyer  agent@…       │
│ 16:31  Chez Marcel         Pas intéressé         agent@…       │
│ 15:58  Pizza Vera          À relancer     flyer  agent@…       │
│        « rappeler après 18 h »                                 │
│ 15:12  Le Comptoir         Converti       flyer  agent@…       │
└────────────────────────────────────────────────────────────────┘
```

Six rules this encodes:

- **An arrival is ambient, never a toast.** Principle 8 was written for the
  field side but the logic is the same here: a visit that landed is a fact that
  stays true, and the admin who was making coffee should find it on the list
  rather than have missed it. `sonner` stays for things the admin *did*.
- **The edge is the outcome's consequence, not the outcome.** A row's leading
  edge uses `STATUS_EDGE[OUTCOME_TO_STATUS[outcome]]`, so the column scans as
  "what does this leave me to do" — `À relancer` mustard, `Converti` green,
  `Refusé` red. The outcome's own French label sits in its column, because
  colour never carries the information alone.
- **Time is the spine.** The feed orders by `received_at`, not `visited_at` —
  the server's clock, not the phone's, because a phone's clock can be wrong
  (INVARIANT 12) and the feed's promise is "what has reached me". Times are
  `.tnum` and left, where the prospect list puts numbers right: this column is
  read down as a sequence, not compared as quantities.
- **A new row is marked once and then settles.** Principle 5 allows motion where
  something changed, so an arriving row holds a brief wash and releases it.
  Under `prefers-reduced-motion` it appears without the transition — it is never
  the only signal that the row is new.
- **No scroll-area.** A pane with its own scrollbar inside a page that also
  scrolls is two scrollbars and a lost keyboard. The page scrolls; the feed is
  the page.
- **A visit to a merged prospect still appears.** Every other admin list filters
  `merged_into IS NULL`, but this one records what agents did, and an absorbed
  prospect keeps its visits (`prospecting.md`). The name shown is the one the
  visit was made against.

Empty, it is an invitation like every other empty screen: « Aucune visite reçue.
Les visites apparaissent ici dès qu'un agent synchronise. »

### The repair queue

Visits the server took but could not place
([ADR-0022](adr/0022-quarantine-visits-the-server-cannot-take.md)). The screen
asks one question and only one: **where does this visit belong?** Everything
else on the row is evidence for answering it.

```
│ Visites à rattacher                             3 visites      │
│ Conservées, mais elles ne comptent pas encore.                 │
├────────────────────────────────────────────────────────────────┤
│ 16:42  Converti        flyer   agent@…      Prospect introuvable│
│        « patron absent, repasser jeudi »                        │
│        Rattacher à   [Le Bistrot · 12 m] [Chez Marcel · 48 m]  │
│                      [Pizza Vera · 130 m]         [Supprimer]   │
├────────────────────────────────────────────────────────────────┤
│ 15:12  Pas intéressé           agent@…      Prospect d'un autre │
│        Le Comptoir                                              │
│        [Rattacher à Le Comptoir]                  [Supprimer]   │
└────────────────────────────────────────────────────────────────┘
```

Five rules this encodes:

- **The edge previews what repairing would do, and the lede says it has not
  happened.** A row uses `STATUS_EDGE[OUTCOME_TO_STATUS[outcome]]` like the live
  feed, so a `Converti` waiting to be attached already reads green. That is the
  one thing on the row that could mislead — the outcome has *not* taken effect —
  so the screen's lede carries the correction for every row at once rather than
  repeating a badge on each. The edge is a forecast here, not a record.
- **Two reasons, two different asks, one row shape.** `Prospect introuvable`
  needs a choice between candidates; `Prospect d'un autre` needs a nod, because
  the visit already names its prospect. Both stay one dense row with its actions
  inline: a dialog per row would turn a queue of five decisions into five
  journeys, and the evidence the admin needs — time, outcome, note, agent — is
  what the row already shows.
- **The server proposes; the admin does not search.** Candidates are the nearest
  live prospects to where the visit was recorded, distance shown on each button,
  nearest first. This is the `DuplicatesScreen` bargain: there is no prospect
  picker in this app and this screen does not earn one. A visit with no recorded
  position offers no candidates and says so — an arbitrary list would invite a
  wrong answer rather than no answer.
- **Distance is on the button, not in a column.** It is the reason to press
  *that* button, so it belongs inside the target, not three columns away.
- **Discard is confirmed and named for what it does.** It is the one place this
  app deliberately loses a visit, so it takes the `ScriptsScreen` dialog pattern
  and its body names the consequence. It sits right of the row, away from the
  attach buttons, because a misclick here is unrecoverable.

Empty is the healthy state, so it reads as reassurance rather than a failure:
« Aucune visite à rattacher. Tout ce que les agents ont envoyé est arrivé à
destination. »

#### A place that looks already listed

The same restaurant can come from OpenStreetMap and from Google under two ids, and
the dedupe key cannot see it ([ingestion](domains/ingestion.md#duplicates-across-providers)).
The server compares every answer with the list; the panel shows what it found:

```
┌─────────────────────────────┐
│ 3               2           │
│ 3 lieux trouvés 2 semblent  │
│                 déjà dans…  │
├─────────────────────────────┤
▌Le Bouchon        Restaurant │  ← warn edge
▌12 rue des Bouchers          │
▌Semble déjà dans la liste :  │
▌Le Bouchon                   │
│Pizza Vera   Restauration r. │  ← status-new edge
▌Sans nom                Bar  │  ← status-rejected edge
├─────────────────────────────┤
│ ☐ Importer aussi les 2 lieux│
│   qui semblent déjà dans la │
│   liste                     │
│   Un doublon importé se     │
│   fusionne ensuite…         │
│ [Retour] [Importer 1 prosp.]│
└─────────────────────────────┘
```

- **A third kind of row, on the same edge.** `status-new` imports, `status-rejected`
  cannot, and `warn` means "look first": the colour `follow_up` already uses for
  "someone owes this a look". The edge never speaks alone: the row names the listed
  prospect it looks like, so the admin can judge the match without leaving the screen.
- **Out by default, in with one box.** The import count and the button leave the
  flagged places out. One checkbox under the list takes them all back, and the
  button's count follows it. It is not a checkbox per row: the list stays a ledger
  (no checkboxes-as-chrome), and a wrong call is cheap either way. A place left out
  can be imported by searching again, and one imported by mistake is what the
  Doublons screen merges.
- **The opt-in belongs to one answer.** A new search starts unchecked again. Ticking
  the box for one area must not quietly apply to the next.

## Principles

1. The list is the product. Chrome yields to rows.
2. Status is structural before it is textual.
3. One toolbar slot.
4. Numbers are tabular and right-aligned.
5. Motion only where something changed — the toolbar swap, a row settling after
   assign. Nothing fades in on scroll, nothing animates on hover by default.

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

The admin side is a dashboard. The field side is **the tear-off** — the ticket
pulled out of the *carnet de tournée* and held in one hand.

Everything below is designed for one situation: an agent standing on a pavement
in Brussels, phone in one hand and a stack of flyers in the other, sun on the
screen, often with no signal, wanting to be done with this door and on to the
next. That situation, not the admin's, decides every trade-off here.

The palette and the typeface are not re-decided for this side. Tokens are shared
(`app.css`), the mark is shared, the band is shared. What changes is **density,
target size, and how much the screen commits to one thing at a time.**

### Next-stop card

Nearest-next ordering means the first item in the list is not a row — it is an
instruction. So it gets a card: a gold 4px inset edge, its own `StopNumber` in
`variant="next"`, the name, "type · address", the distance, then "Y aller" and
"Visiter" — the same pair a stop row reveals on tap. Every other stop is a
`StopRow`, a quiet ledger beneath the card.

```
┌──────────────────────────────────┐
│ ▮ Captain Prospectus        ● 3  │  band: mark, wordmark, sync state
├──────────────────────────────────┤
│ Hors ligne. Vos visites sont…    │  strip: only when there is something to say
├──────────────────────────────────┤
│ Tournée du jour                  │
│ 5 arrêts                         │
│                                  │
│▎ PROCHAIN ARRÊT                  │
│▎ (1) Le Bouchon des Filles       │
│▎     Restaurant · 12 rue Ste-C.  │  gold 4px edge, gold disc
│▎                         120 m   │
│▎ ┌────────────┐ ┌────────────┐   │
│▎ │  Y aller   │ │  Visiter   │   │  48 px; « Visiter » is the gold one
│▎ └────────────┘ └────────────┘   │
│                                  │
│┃ (2) Café de la Poste     340 m  │  stop row, status edge, collapsed
│┃ (3) Chez Marcel          410 m  │
│┃ (4) Pizzeria Vesuvio     820 m  │
│┃     [Pas encore envoyé]         │  a queued visit: badge, same place
│┃     ┌─────────┐ ┌─────────┐     │  row 4 tapped open
│┃     │ Y aller │ │ Visiter │     │
│┃     └─────────┘ └─────────┘     │
│                                  │
│ Plus tard                        │
│┃ Le Comptoir                     │  future follow-ups, not walkable
│┃ À relancer le 18/09/2026        │
├──────────────────────────────────┤
│   ⬤        ⬤                    │  tab bar (GH #66, "Tab bar" below):
│ Tournée  Ajouter                 │  fixed at the bottom below 768px
└──────────────────────────────────┘
```

**The stops are numbered, and here that is earned.** Numbered markers are
usually decoration pretending to be structure — but `orderByNearestNext`
produces a walking order, so this list genuinely *is* a sequence, and "I am on
my fourth of eleven" is something an agent wants to know. `StopNumber` is a
32px tabular disc: gold on the card, `secondary` on a row.

**The card carries the only actions that do not need a tap.** A stop row is
collapsed by default — number, name, "type · address", the outbox badge when
there is one, and the distance, `min-h-16` with its own 4px status edge — and
tapping its header (`aria-expanded`, `aria-controls`) expands it in place to
the same "Y aller"/"Visiter" pair as the card, no navigation and nothing
written to Dexie. Opening one row closes whichever was already open: at most
one is expanded at a time. Neither action needs a swipe (story 117.3 adds
that as a second way in, not the only one). Without coordinates, "Y aller" is
absent and "Visiter" takes the row's full width — on the card too.

**Pas encore envoyé.** A stop whose visit is sitting in `outboxVisits`, or a
field prospect still in `outboxProspects`, carries a `warn`-tinted badge with
that text on its row. It is read-only knowledge of the outbox: it never hides
the stop, changes its status or moves it in the walking order (invariants 2,
3) — the row looks exactly like any other until a sync replaces `prospects`
and the badge is simply not there any more.

**Plus tard** is follow-ups not yet due, each a plain `<li>` — no button, no
link, name and "À relancer le {date}" only. They "can't be visited from here"
(EXPERIENCE.md): the round is not the place to jump a follow-up's own date.

**The round carries no "Ajouter un prospect" button of its own.** The Ajouter
tab — bottom on a phone, inline in the band from 768px ("Tab bar" below) — is
the one way to add a place, so the screen does not duplicate it under the list.

**From 768px, the list sits left and the next stop right.** A `md:grid
md:grid-cols-5` splits the screen roughly 40/60: the list and Plus tard take
the first two columns, the card the remaining three, `md:sticky` so it stays
in view while the list scrolls. The card is still first in the DOM — only its
grid placement moves it to the right — so a screen reader or a keyboard tab
order meets it before the list either way.

### One decision per screen

The today list asks *which door*. The visit form asks *what happened*. Nothing
else is allowed to compete.

```
┌──────────────────────────────────┐
│ ←  Le Bouchon des Filles         │
├──────────────────────────────────┤
│  ┌────────────────────────────┐  │
│  │ [x] Flyer remis            │  │  a card, not a bare row
│  │     Cochez si vous avez    │  │
│  │     laissé un flyer sur    │  │
│  │     place.                 │  │
│  └────────────────────────────┘  │
├──────────────────────────────────┤
│  Résultat                        │
│  ┌────────────────────────────┐  │
│  │ [ic] Personne sur place ( )│  │  icon tile · label · hint · disc
│  │     Fermé ou personne pour │  │
│  │     répondre. On repassera.│  │
│  ├────────────────────────────┤  │
│  │ [ic] Intéressé          (x)│  │  ← gold: chosen, never a status
│  │     Ouvert à la discussion,│  │
│  │     pas encore d'accord.   │  │
│  ├────────────────────────────┤  │
│  │ [ic] Pas intéressé      ( )│  │
│  │     Refus clair.           │  │
│  ├────────────────────────────┤  │
│  │ [ic] À relancer         ( )│  │
│  │     Un rendez-vous à       │  │
│  │     reprendre. Indiquez la │  │
│  │     date.                  │  │
│  ├────────────────────────────┤  │
│  │ [ic] Converti           ( )│  │
│  │     Accord obtenu.         │  │
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
│  [   Enregistrer la visite   ]   │  sticky above the tab bar (GH #66)
└──────────────────────────────────┘
```

The outcome list takes an unreasonable share of the screen on purpose. It is the
one thing the whole app exists to capture, and it has to be hittable by a thumb
without the agent looking carefully. Five stacked full-width cards, `min-h-
decision` each, not a select and not a grid of chips.

**Every card is the same neutral colour, chosen or not (INVARIANT 3).** A 40px
`bg-secondary` icon tile — `DoorClosed`, `ThumbsUp`, `ThumbsDown`, `Clock`,
`BadgeCheck` — sits left of the label and a one-line hint, with a 24px disc on
the right. The five icons and the five hints are the only thing that tells one
card from another; nothing about their colour does. Picking a card turns its
tile and disc gold, adds a check, and washes the card at 12% gold with a
gold-edge border — DESIGN.md's `outcome-card-selected` component token,
implemented here with `has-[:checked]:` utilities rather than a class of its
own. That is *selection*, the same gold that marks the current tab or sidebar
item, never a preview of the status `OUTCOME_TO_STATUS` would derive from the
outcome.

**A hint describes what the agent saw or heard, never what it does to the
prospect.** "Refus clair.", not "passe en Refusé" — the mapping to a status is
the server's alone, and a client that previews it is a client that can disagree
with it. The new status arrives on the next sync, in the list.

**Flyer remis is a card too, not a bare checkbox row**, so it reads at the same
weight as the decision beneath it: a checked square, the label, and a hint
underneath saying what to check it for.

**A blocked "Continuer" (or, with no script, "Enregistrer la visite") moves the
screen to the decision.** "Choisissez un résultat." appears under Résultat as a
`role="alert"`, and focus moves to the first outcome card's own radio,
scrolled to the centre of the screen — the message says why, the focus says
where, and a thumb that was already near the outcome list never has to hunt for
either.

### The script is the second screen

M3 puts the active script's questions in the visit form. Principle 6 decides the
shape before anything else does: *if a screen asks two questions, it is two
screens.* The outcome is what the app exists to capture and nothing may compete
with it, so the questions do not join it — they follow it.

```
     step 1                             step 2
┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ ←  Le Bouchon des Filles         │ │ ←  Résultat                      │
│ ●  Étape 1 sur 2 · Résultat      │ │ ●  Étape 2 sur 2 · Questions     │
├──────────────────────────────────┤ ├──────────────────────────────────┤
│ [x] Flyer remis                  │ │  Questions                       │
├──────────────────────────────────┤ │                                  │
│  Résultat                        │ │  Proposez-vous la livraison ?    │
│  ┌────────────────────────────┐  │ │  ┌─────────┐ ┌────────────┐      │
│  │ [ic] Personne sur place ( )│  │ │  │   Oui   │ │    Non     │      │
│  ├────────────────────────────┤  │ │  └─────────┘ └────────────┘      │
│  │ [ic] Intéressé          (x)│  │ │                                  │
│  ├────────────────────────────┤  │ │  Quelle caisse utilisez-vous ?   │
│  │ [ic] Pas intéressé      ( )│  │ │  ┌────────────────────────────┐  │
│  ├────────────────────────────┤  │ │  │ Aucune                     │  │
│  │ [ic] À relancer         ( )│  │ │  ├────────────────────────────┤  │
│  ├────────────────────────────┤  │ │  │ Papier                     │  │
│  │ [ic] Converti           ( )│  │ │  └────────────────────────────┘  │
│  └────────────────────────────┘  │ │                                  │
│                                  │ │  Notes                           │
│  Relancer le   [ 29/09/2026 ]    │ │  ┌────────────────────────────┐  │
├──────────────────────────────────┤ │  └────────────────────────────┘  │
│  [        Continuer          ]   │ ├──────────────────────────────────┤
└──────────────────────────────────┘ │  [   Enregistrer la visite   ]   │
                                      └──────────────────────────────────┘
```

**The step indicator names where you stand, not just where the button goes.**
This reverses an earlier call here — "no 1 sur 2, no dots, no progress bar" —
because DESIGN.md's redesign (› Step indicator) asks for one, echoed in
EXPERIENCE.md › Step indicator: an action's own name is not enough to say
*which* step an agent is on. A `size-1.5` gold dot leads a `text-overline` line
reading « Étape 1 sur 2 · Résultat » or « Étape 2 sur 2 · Questions », on both
steps, and it is absent only when the visit has one step to begin with — a
script with nothing this build can render must never make the one-step path
read "1 sur 2". An action still keeps its own name through the flow, so «
Enregistrer la visite » still appears exactly once, on the screen that
actually saves, and step 1 still offers « Continuer » — the indicator says
*which* step, the button still says *what happens next*.

**The back link names its destination rather than pointing vaguely backwards.**
On step 2 it reads « Résultat », not « Retour à la tournée »: it returns to step
1 with the draft intact. Leaving the visit entirely is still possible from there,
one step further out. Nothing an agent has typed is ever one stray tap from
being lost.

**Step 2 exists only when there is something to ask.** No cached script, or a
script whose questions this build cannot render, and the form is exactly what it
was in M2 — one screen, notes inline, « Enregistrer la visite ». A missing
questionnaire must never stand between an agent and a saved visit, and it must
not cost a tap either.

**`no_contact` still gets step 2, with nothing required.** Nobody was there to
ask, so `field-operations.md` waives the required questions — but the notes live
on this screen, and "ferme le lundi" written off a sign in the window is the most
valuable thing an agent can record about a door nobody answered. Hiding the step
would hide the notes with it. So the step stays and the obligation goes.

**A blocked save moves the screen to the problem.** With a variable number of
questions, the first invalid one can easily sit below the fold, and a button that
appears to do nothing is how a form gets abandoned on a pavement. Saving with an
invalid answer scrolls that question into view and focuses it, as well as marking
it. This is the same trap `withOutcome` exists to dodge, one screen along.

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
│  50,8467  4,3525     Actualiser  │  or « Utiliser ma position »
│                                  │
│  [          Ajouter          ]   │
```

### Sync is ambient, never a toast

An agent's sync state is a **condition, not an event**. "Three visits waiting to
send" stays true for as long as there is no signal — sometimes hours. A toast
shows it for four seconds and then lies by omission.

So sync lives in two permanent places, both drawn from one pure function
(`syncView`, `src/client/field/sync-view.ts`) that decides all seven states in
one place rather than letting the band and the strip each branch on their own:

- **A dot and a count in the band**, always visible, on every field screen. The
  count pill (28px, `band-accent`, full radius) shows whenever something is
  pending, in every state below. The dot always carries its own accessible
  name too — synced included — because it sits on `role="img"`, not on a
  wrapper a screen reader would skip.
- **A strip under the band** that appears only when there is something to say.
  When nothing is pending and the last sync succeeded, there is no strip at
  all — the quiet state is silence, not an empty banner.

| State | Dot | Strip | Message | Button |
|---|---|---|---|---|
| Synced | `success`, no count | none | — | — |
| Waiting to send | `warn` + count | `band-strip` (the band, one step darker) | `copy.sync.pending` | — |
| Syncing | pulsing `band-muted`, with a halo | none, unless also waiting | as waiting | — |
| Offline | `warn` + count | `secondary` | `copy.sync.offline` | — |
| Failed | `warn` + count | `secondary` | `copy.sync.failed` | — |
| Session expired | `destructive` + count | `destructive`, `on-destructive` text | `copy.sync.authExpired` | Se reconnecter |
| Update needed | `warn` + count | `warn`, `on-destructive` text | `copy.sync.upgrade` | Mettre à jour |

Only two states carry a button, because only two ask the agent for something
the app cannot do by itself:

- **Se reconnecter** navigates to the current URL plus `?reconnect=1`. The
  service worker serves every other navigation from precache
  (`navigateFallback: "index.html"`), which never reaches Cloudflare Access, so
  a plain reload cannot re-authenticate an expired session — this marker is the
  one entry `navigateFallbackDenylist` excludes from that fallback
  (`vite.config.ts`), so this one navigation goes to the network and through
  Access. The app removes the marker from the URL once it has landed
  (`withoutReconnectMarker`, `App.tsx`). The outbox is never touched by this —
  a session expiring is not a reason to lose a visit (INVARIANT 5).
- **Mettre à jour** takes a build already waiting, or reloads if the browser
  has not noticed one yet — either way the *next* sync's 426 can call
  `applyUpdateNow` again from a fresh page load. The shared `UpdatePrompt`
  Alert says the same fact, so it is hidden while this strip shows it
  (`hidesUpdateBanner`).

Offline and failed retry on their own, so a button there would ask the agent to
do what is already happening. Session expired and update needed keep their
strip and button while a retry runs in the background — `syncView` only lets
`running` make the dot pulse for those two, never drop the button or swap the
message, because `nextDelayMs` (`sync-schedule.ts`) keeps retrying both on
backoff and a button that disappears on every attempt is worse than a static
one.

The strip sits in two always-mounted live regions, one `aria-live="polite"`
and one `"assertive"`, rather than one region that toggles the attribute — a
screen reader that has never seen a region announce anything can miss its
first change, and "your session just expired" is exactly the message that
must land. Session expired and update needed use the assertive region; every
other state uses the polite one. Colour is never the only signal either way:
every dot and strip pairs its colour with a count, an icon or a French
sentence.

This is a deliberate departure from the roadmap's "a shadcn `sonner` toast on
failure". A toast is the wrong medium for a persistent condition, and it costs
~5 kB gzipped the field route does not have (ADR-0015). `sonner` stays on the
admin side, where the events it reports really are events.

### Tab bar

One component, two layouts, not two (GH #66): below 768px a bar fixed to the
bottom of the screen, 64px plus `safe-area-bottom`, `card` fill with a 1px top
border; from 768px the same tabs sit inline in the band's own row instead,
where the old band nav lived, and carry the band palette rather than the
card's. `position: fixed` ignores where an element sits in the DOM, so the
tabs live once, in the header markup, and only their classes switch at the
breakpoint — building two components would let the tab list and the current
tab's rule drift apart.

```
┌──────────────────────────────────┐
│ ⬤ Tournée  ⬤ Ajouter  ▤ Tableau  │  ← 768px: inline in the band
├──────────────────────────────────┤
│                                  │
│           (the round)            │
│                                  │
├──────────────────────────────────┤
│   ⬤        ⬤         ▤          │  < 768px: fixed at the bottom
│ Tournée  Ajouter  Tableau de bord│
└──────────────────────────────────┘
```

Each tab is a 24px Lucide icon over a `text-meta` label, at least 48px in
every dimension the thumb can miss. Below 768px the current tab carries a gold
pill behind its icon alone (`primary` fill, `primary-edge` inset ring) and its
label goes bold `foreground`; an inactive tab is plain `muted-foreground`.
From 768px the pill grows to the whole row instead — gold fill, `primary-edge`
inset ring, `primary-foreground` (navy) icon and label — reading like the
current item in the admin sidebar; an inactive tab there stays
`band-foreground` in every state, with a `band-accent` hover, and is never
`band-muted` — same rule as the sidebar's own item text (Layout, above):
`band-muted` is for group labels only.

**A screen's own action bar sits directly above the tab bar, never under
it.** Below 768px the tab bar is the field's bottommost fixed element and
owns `.safe-bottom` there; `VisitScreen`'s and `AddProspectScreen`'s own
sticky "Enregistrer"/"Ajouter" bar is offset up by the tab bar's height
(`.above-tab-bar`, `app.css`) rather than sharing its `bottom: 0` — two fixed
elements at the same coordinates only differ by which one *paints* on top,
and DOM order here would have hidden the save button under the tab bar, not
the other way round. From 768px there is no tab bar underneath, so the action
bar returns to `bottom: 0` and carries its own `.safe-bottom`-equivalent
inset again. Scrolling content clears whichever bars sit below it —
`.pb-tab-bar` for a screen with no action bar of its own, `.pb-action-bar` for
one that has one — both `calc()`'d off `--spacing-tab-bar-height` and the
safe-area inset rather than a guessed pixel figure.

**Four possible slots, two or three ship now.** Tournée and Ajouter for every
role, Tableau de bord last for an admin — and two gates, not one, decide that
last slot (spec-gh-115, `field/identity.ts`'s `adminAccess`). `screens` is the
security decision (invariant 10): a server-confirmed admin in this session,
unaffected by the network coming and going. `entry` — what the tab and the
`/` redirect read — additionally requires a live network, read from `window`'s
`online`/`offline` events (`useOnline`) rather than `useSync`'s trigger 2,
which listens for `online` only, so the tab goes the instant the network
drops and is back the instant it returns, with no reload. Carte is the fourth
slot the mockup draws; it stays out until epic-field-screens ships the screen
it would point to, same rule as the sidebar's own nav items. Tableau de bord
disappears outright rather than showing disabled, because the admin side
needs the network to do anything at all. A session that opened offline on a
cached admin identity re-asks `/api/me` once the network is confirmed live; a
confirmed admin regains the tab and the admin screens without a reload.
Losing the network hides only the tab: an admin already on an `/admin`
screen keeps it (#97 designs what that screen says with no network).

**A tab tap never silently discards a draft (#74).** `/tournee`'s own rule
differs from every other tab's — it is an index route, so it must match only
itself, or the admin sidebar's "path, or anything under it" rule would light
it up on `/tournee/nouveau` and on an open visit too (`isCurrentTab`,
`tabs.ts`). Tapping a tab away from a dirty visit or add-prospect form — one
react-hook-form `formState.isDirty` the open screen registers, read at the
moment of the tap — opens a shadcn AlertDialog, "Quitter sans enregistrer ?",
and leaves only on "Quitter". "Annuler" leaves the draft exactly as it was,
values and focus both. Tapping the tab that is already current never asks and
never navigates. A save's own `navigate("/tournee")` bypasses the guard
entirely — it is built on the tab bar's own click handler, not on the router,
so a save is never the thing a dialog interrupts.

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

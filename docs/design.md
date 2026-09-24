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
they suit the app — navy is ink, gold is what you are steering towards.

So the admin side is a **dashboard**: the figures that say how the canvassing is
going come first, and the lists sit beneath them. The field side is the ticket
torn out of that notebook — few controls, large targets — and gets its own
design pass in M2 (ADR-0014, decision 3).

A new global design is being specified; the screen-by-screen sections below
describe the current screens and will be rewritten from it.

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
rail — three admin screens do not earn that much chrome. The two sides share
the band's look and tokens, but each owns its frame: the admin frame ships in
the admin chunk, and the field band carries the sync state.

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
thing carrying actions — not by a box, a shadow or a different radius.

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

### The script is the second screen

M3 puts the active script's questions in the visit form. Principle 6 decides the
shape before anything else does: *if a screen asks two questions, it is two
screens.* The outcome is what the app exists to capture and nothing may compete
with it, so the questions do not join it — they follow it.

```
     step 1                             step 2
┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ ←  Le Bouchon des Filles         │ │ ←  Résultat                      │
├──────────────────────────────────┤ ├──────────────────────────────────┤
│  Flyer remis               [ ●]  │ │  Questions                       │
├──────────────────────────────────┤ │                                  │
│  Résultat                        │ │  Proposez-vous la livraison ?    │
│  ┌────────────────────────────┐  │ │  ┌───────────┐ ┌──────────────┐  │
│  │ Personne sur place         │  │ │  │    Oui    │ │     Non      │  │
│  ├────────────────────────────┤  │ │  └───────────┘ └──────────────┘  │
│  │ Intéressé                  │  │ │                                  │
│  ├────────────────────────────┤  │ │  Quelle caisse utilisez-vous ?   │
│  │ Pas intéressé              │  │ │  ┌────────────────────────────┐  │
│  ├────────────────────────────┤  │ │  │ Aucune                     │  │
│  │ À relancer                 │  │ │  ├────────────────────────────┤  │
│  ├────────────────────────────┤  │ │  │ Papier                     │  │
│  │ Converti                   │  │ │  └────────────────────────────┘  │
│  └────────────────────────────┘  │ │                                  │
│                                  │ │  Notes                           │
│  Relancer le   [ 29/09/2026 ]    │ │  ┌────────────────────────────┐  │
│                                  │ │  └────────────────────────────┘  │
├──────────────────────────────────┤ ├──────────────────────────────────┤
│  [        Continuer          ]   │ │  [   Enregistrer la visite   ]   │
└──────────────────────────────────┘ └──────────────────────────────────┘
```

**The button names where you are going, and that is the whole step indicator.**
No "1 sur 2", no dots, no progress bar. An action keeps its name through the
flow, so « Enregistrer la visite » appears exactly once — on the screen that
actually saves. Step 1 offers « Continuer », which is a promise of one more
screen and nothing else.

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

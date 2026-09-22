# ADR-0018: One form stack — react-hook-form everywhere, the field route included

- Status: proposed
- Date: 2026-09-22
- Deciders: mohss, Claude
- Supersedes: the *validation* decision of [ADR-0015](0015-native-controls-on-the-field-route.md)

## Context

[ADR-0015](0015-native-controls-on-the-field-route.md) made two separable
decisions about the field route, on one measurement:

1. **Controls**: native `<input type="date">` and hand-built radio/checkbox rows
   instead of shadcn's, because Radix cost 39.6 kB gzipped for behaviour the
   platform already provides.
2. **Validation**: controlled `useState` validated against the shared zod schema
   instead of react-hook-form, because `form` costs bytes this route did not have.

It also wrote down, in its own Consequences, what would reopen the second one:

> **Harder: dynamic forms on the field side.** M3 puts script questions in the
> visit form — a variable list with per-type validation. That is exactly what
> react-hook-form is good at, and we will be doing it with controlled state.
> **Re-measure then; if the headroom exists, adopting `form` for the field route
> is a new ADR, not a silent reversal.**

This is that ADR, at that moment. Two things have changed since:

- [ADR-0017](0017-zod-mini-for-the-shared-wire-contract.md) took the field entry
  chunk from 158.78 kB to **141.95 kB** gzipped, so there is headroom to discuss.
- M3's visit form stops being four fixed fields. It becomes a two-step form over
  a variable list of questions whose validation rules are per-type and depend on
  the outcome chosen in the previous step (required unless `no_contact`). Hand-
  rolled `useState` for that means hand-rolling per-question error identity,
  focus management, and the "an error is pinned to a control that is no longer
  mounted" trap `withOutcome` already exists to dodge once.

The repo also has a second-source problem that ADR-0015 predicted: *"Validation
error rendering becomes ours… it is now a thing that can be done inconsistently
across two screens."* It was. `VisitScreen` had a local `FieldError`, and
`AddProspectScreen` inlined the same markup three times.

## Decision

**We will use shadcn `form` over react-hook-form for every form in the repo,
the field route included.**

- `src/client/ui/form.tsx` and `src/client/ui/label.tsx` are vendored.
- `VisitScreen` and `AddProspectScreen` are converted in the same change that
  adopts it, so there is never a second pattern to copy from.
- **ADR-0015's controls decision stands entirely.** `FieldCheckbox`,
  `FieldRadioGroup`, `FieldRadioOption` and `<input type="date">` keep the field
  route off Radix. This ADR changes who owns *validation state*, not what the
  agent taps.

Three constraints on how it is adopted, all of them load-bearing:

1. **The rules do not move into the component.** `VisitScreen`'s resolver *is*
   `toVisit` from `visit-draft.ts` — the pure function the test suite already
   drives. It returns which control failed and why; the resolver only restates
   that in react-hook-form's error shape. `AddProspectScreen`'s resolver is
   `z.pick` of `fieldProspectSchema`, so the caps the server enforces are the
   caps the control enforces, from one definition.
2. **react-hook-form owns no persistence.** The outbox write and its `catch`
   are untouched (INVARIANT 5). `isSubmitting` replaces a `saving` flag and
   nothing else.
3. **`FormMessage` renders its children, never `error.message`.** Zod's messages
   are English; INVARIANT 15 puts user-facing strings in `copy.ts` in French.
   The component renders the French text a screen passes and nothing otherwise,
   so English cannot leak into the UI through a default.

`FormLabel` renders a plain `<label>`, not Radix's — ADR-0015's reasoning
applied unchanged, since `<label htmlFor>` is not behaviour the platform lacks.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep ADR-0015's validation decision; hand-roll M3's dynamic form | The honest option, and it costs nothing to download. It means hand-writing per-question error identity and the unmounted-control trap for a list whose shape an admin edits at runtime. That is the case react-hook-form exists for, and doing it by hand is where a visit gets lost to a form that will not submit and will not say why |
| react-hook-form on the admin side only, native on the field route | Cheapest, and it was the recommendation. Rejected by the owner in favour of one stack: two form idioms in one repo is a standing tax on every future screen and every review, and the script editor and the visit form are the *same feature* seen from two ends |
| Adopt `form` but keep Radix's `Label` with it | Pulls Radix onto the field route for click-forwarding on non-label elements, which is the exact trade ADR-0015 measured and refused |
| Let `FormMessage` render zod's `error.message` | Ships English strings to a French UI and routes user-facing copy around `copy.ts`, breaking INVARIANT 15 quietly and everywhere at once |

## Consequences

Measured with `pnpm build` on this branch, against ADR-0017's numbers:

| | M2 baseline | after ADR-0017 | after this ADR |
|---|---|---|---|
| **field entry chunk** | 158.78 kB | 141.95 kB | **142.04 kB** |
| shared field chunk | 1.19 kB | 1.19 kB | 13.88 kB |
| `VisitScreen` + `AddProspectScreen` | 3.78 kB | 3.78 kB | 5.33 kB |
| **total field JS precached** | 165.95 kB | 149.12 kB | **164.71 kB** |

- **The budget holds. 142.04 kB against 150 kB**, up 0.09 kB. react-hook-form
  lands in the *shared chunk of the two lazy field screens*, not the entry chunk,
  because `VisitScreen` and `AddProspectScreen` have been lazy since M2.
- **But the entry chunk is not the whole truth, and ADR-0015 said so first**:
  "it does not save the bytes, it defers them: the service worker precaches every
  chunk so the app works offline." On that measure this costs **15.6 kB** and the
  total lands at 164.71 kB — a kilobyte *below* where M2 left it. **ADR-0017's
  win paid for this almost exactly.** That is the honest framing: not free, paid
  for, and the receipt is above.
- **The 150 kB number in vision.md governs the entry chunk**, which is how it has
  been measured at every milestone (M1's 126 kB, M2's 158 kB). This ADR does not
  move it. It does record that the precached total is the number an agent's
  connection actually experiences, and that the two should be quoted together
  from here on.
- **The headroom is gone.** 8 kB before, 8 kB after, and the precache total is
  back where M2 left it. M3's script questions add to the *lazy* chunk, so they
  do not threaten the budget as written — but the next structural cost has
  nothing left to spend and will need its own measurement.
- **Error rendering is one component now.** `FieldError` and three copies of
  inline error markup are gone. What ADR-0015 flagged as "a thing that can be
  done inconsistently across two screens" is now done in one place, with
  `role="alert"` preserved and `aria-invalid`/`aria-describedby` wired by
  `FormControl` rather than by hand.
- **Harder: react-hook-form and the React Compiler.** `form.watch()` returns a
  function the compiler cannot memoize and it skips the whole component
  (`react-hooks/incompatible-library`). `useWatch({ control, name })` is the
  compiler-safe form and is what `VisitScreen` uses. Anyone reaching for
  `watch()` will get a lint warning, which is the right outcome.
- **Harder: the resolver generics.** `standardSchemaResolver` infers badly when
  the form type is declared by hand and the schema's output differs from it
  (`z.nullish` versus `""`). Letting `z.infer` declare the form type avoids a
  cast; declaring it by hand needs one. Prefer the former.

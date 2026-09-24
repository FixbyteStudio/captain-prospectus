# ADR-0015: Native form controls on the field route where shadcn's cost breaches the bundle budget

- Status: accepted — validation decision superseded by [ADR-0018](0018-one-form-stack.md)
- Date: 2026-09-22
- Deciders: owner

## Context

[ADR-0014](0014-tailwind-and-shadcn-ui.md) decision 2 says we do not hand-roll
an element shadcn already provides, and names "a date picker" among them. Its
own consequences section sets the counterweight:

> **The bundle grows**, and the field client is the one that matters. Measure it
> at the end of M2 … if the field route's JS exceeds a budget we set there,
> split the admin and field bundles by route before adding more.

That budget is in [vision.md](../vision.md): **the field route's JavaScript
stays under 150 kB gzipped**, because an agent loads this app outdoors on a bad
connection, and "complete a visit with zero network in under 60 seconds" is a
success criterion. The admin/field split ADR-0014 asks for is already done —
`AdminApp` is a lazy chunk, and TanStack Query, Radix, sonner and PapaParse live
behind it.

**Measured on this branch before M2 adds anything: 125.99 kB gzipped.** The
headroom is 24 kB, and it has to cover the whole of M2.

The visit form needs four controls — flyer given, outcome, an optional
follow-up date, notes — plus a type chooser on the add-prospect screen. Taking
the shadcn component for each, with its dependencies landing in the *entry*
chunk because the field route is not lazy:

| Control | shadcn component | brings | order of magnitude, gzipped |
|---|---|---|---|
| follow-up date | `calendar` | react-day-picker + date-fns | 25–35 kB |
| the form itself | `form` | react-hook-form + @hookform/resolvers | ~14 kB |
| prospect type | `select` | Radix Select + Popper + Portal + DismissableLayer | ~15 kB |
| outcome | `radio-group` | Radix RadioGroup + Radix core | ~8 kB |
| notes | `textarea` | nothing — it is a styled `<textarea>` | ~0 kB |

Only the last two fit. `calendar` alone breaches the budget; `form` and
`select` together consume it. The dependency figures are published package
sizes, not measurements — the number this ADR actually binds is the entry chunk
measured at the end of M2.

Two further facts bear on the choice rather than just the arithmetic:

- The field route has **zero Radix today**. The vendored components that import
  it are all admin-only, so the first Radix primitive a field screen uses also
  pays for Radix's shared core.
- A phone already has a date picker. `<input type="date">` opens the OS wheel on
  iOS and the OS calendar on Android — one thumb, no scroll trap, correct at any
  text size, and localised without `fr-FR` plumbing. react-day-picker renders a
  month grid sized for a mouse. Here the native control is not a compromise; it
  is the better one.

None of this touches [ADR-0002](0002-zero-cost-constraint.md): no service, no
paid plan, and the change removes dependencies rather than adding them.

## Decision

We will build the **field route's** form controls from native HTML elements
wherever the shadcn equivalent's dependencies are material against the 150 kB
budget. Concretely, for M2:

1. **`<input type="date">`** for the follow-up date, not `calendar`.
2. **Controlled React state validated by the existing `visitSchema` and
   `fieldProspectSchema`** from `src/shared/schemas.ts`, not `form` /
   react-hook-form. The zod schemas are already in the chunk, already carry the
   rules (including the `followUpAt`-required-when-`follow_up` refinement), and
   are the same objects the Worker validates against.
3. **`radio-group`** for both the outcome and the prospect type, not `select`.
   Five and six options respectively, each needing a 48 px target anyway — a
   list of large targets is the right field control, and it avoids Radix Select
   entirely.

**The admin route is unchanged.** ADR-0014 decision 2 governs there in full:
the admin side is lazy-loaded, is used on a desktop, and has no comparable
budget. Where both sides need the same control, they may legitimately differ.

**Every use of this exception cites a measurement.** A native control is
justified by a number in the ADR or in `docs/design.md`, not by preference. If a
future measurement shows the headroom exists, the shadcn component is the
default again.

ADR-0014 decisions 1, 3, 4 and 5 are untouched: tokens in `@theme`, a design
pass before each screen, French copy from `copy.ts`, and 48 px targets set in
the vendored component.

## Alternatives considered

| Option | Why not |
|---|---|
| Take the shadcn components and raise the budget in vision.md | The budget is not an arbitrary number to move when it is inconvenient — it encodes "usable outdoors on a bad connection", which is the product's reason for being. Raising it to fit a month grid we do not want on a phone trades the goal for the convention that was meant to serve it |
| Lazy-split the visit form into its own chunk and keep full shadcn | Defensible, and it is still our fallback if the measurement at the end of M2 breaches. But it does not save the bytes, it defers them: the service worker precaches every chunk so the app works offline, so an agent downloads all of it on install regardless. It buys a faster first paint on the today list at the cost of ~45 kB of dependencies we would be carrying to render four fields |
| Hand-roll a date picker instead of using the native input | The worst of both: the accessibility work ADR-0014 exists to avoid, and none of the OS integration that makes `<input type="date">` good on a phone |
| Keep `form`, drop only `calendar` | react-hook-form earns its keep on large dynamic forms, which is M3's script editor on the admin side. For four fields whose rules already live in a zod schema it is a second source of truth for validation, and the field side is where a validation disagreement loses a visit |

## Consequences

- **~45 kB of headroom preserved** for M2's screens, the service-worker
  registration (`workbox-window`, ~5 kB, not optional) and M3.
- **The field date input looks like the OS, not like the admin's.**
  `docs/design.md` must say so, or it reads as an inconsistency bug. Its
  appearance is not ours to style beyond the box.
- **Validation error rendering becomes ours.** `form` ships `FormMessage`; we
  render field errors by hand from the zod result. Small, but it is now a thing
  that can be done inconsistently across two screens — the field screens should
  share one helper.
- **Harder: dynamic forms on the field side.** M3 puts script questions in the
  visit form — a variable list with per-type validation. That is exactly what
  react-hook-form is good at, and we will be doing it with controlled state.
  Re-measure then; if the headroom exists, adopting `form` for the field route
  is a new ADR, not a silent reversal.
- **Harder: telling "cheap enough" from "not".** The rule is only as good as the
  measurement discipline behind it, which is why the citation requirement is
  part of the decision rather than advice.
- **`docs/design.md` gains a field section** recording which controls are native
  and why, so the next person does not "fix" the inconsistency.

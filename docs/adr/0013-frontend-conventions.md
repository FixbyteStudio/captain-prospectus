# ADR-0013: Frontend conventions — plain CSS, French UI, client state

- Status: partially superseded by [ADR-0014](0014-tailwind-and-shadcn-ui.md) — decision 1 (plain CSS) only. Decisions 2 (French UI) and 3 (TanStack Query, admin only) stand.
- Date: 2026-09-21

## Context
The stack ADRs (0004 Vite + React + React Router, 0007 offline-first) left three choices open that
every client PR would otherwise make differently: how to style, what language the UI speaks, and how
the admin side fetches data. Settling them at scaffold time costs nothing; settling them later means
rewriting screens.

## Decision

**1. Plain CSS with custom properties.** One `src/client/styles/tokens.css` holding colour, spacing,
type and touch-target variables; one CSS file per component, imported by that component. No CSS
framework, no CSS-in-JS, no build step beyond Vite's.

**2. The UI speaks French. Everything else is English.** Code identifiers, database values, API
field names, docs, commits and the glossary stay English. Every French string lives in one file,
`src/client/copy.ts`. Enum values (`follow_up`, `no_contact`…) are stored in English and translated
at render, using the tables in [glossary.md](../glossary.md). `<html lang="fr">`, the PWA manifest
and all date/number formatting use `fr-FR` via `Intl`.

**3. TanStack Query on the admin side only.** The admin screens are online-only request/response with
15 s polling ([ADR-0010](0010-live-feed-by-polling.md)), which is what the library is for. The field
client must not use it: there, Dexie is the source of truth and the sync engine owns all writes
([ADR-0007](0007-offline-first-insert-only-sync.md)). A second cache layer over the outbox is exactly
how visits get lost.

## Alternatives considered
| Option | Why not |
|---|---|
| Tailwind | A dependency and a build step for ~8 screens. The field visit form (large touch targets, one column) and the admin table (dense, wide) share almost no visual language, so the utility-class payoff is small |
| CSS Modules | Fine, and needs no dependency — but scoping solves a problem we do not have at this size |
| An i18n library (i18next, lingui) | One language, two users. A key/value object is the same thing without the bundle |
| English UI | The agents work in French on the street; the UI is read under time pressure |
| TanStack Query everywhere, including the field client | Two sources of truth on the phone, contradicting ADR-0007 |

## Consequences
- Adding a second language later means replacing `copy.ts` with a lookup, not touching components.
- The French/English seam is enforced by review: a French string outside `copy.ts` is a bug.
- No design system. If the UI grows past ~15 screens, revisit this ADR rather than accreting CSS.
- `tokens.css` is the one place to change spacing or colours; components must not hardcode values.

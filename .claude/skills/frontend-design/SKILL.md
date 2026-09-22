---
name: frontend-design
description: Decide a Captain Prospectus screen before building it. Use before writing any new screen, or changing the structure of an existing one, on either the admin or the field side. Not for copy-only or logic-only edits.
---

# Design a screen

**This project's visual identity is already decided.** Do not invent a palette, a
typeface or a mood — that work is done and written down. The generic
"give the client a distinctive identity" advice in the plugin skill of the same
name does not apply here, and following it produces a screen that does not
belong to this app.

What is still yours to decide: **structure, hierarchy, and what the screen asks
the user to do.**

## 1. Read before you draw

- `docs/design.md` — the whole thing once, then the section for the side you are
  building. The admin sections and **The field side** (§224) are different design
  problems on purpose.
- The domain doc in `docs/domains/` for the behaviour the screen exposes.
- [ADR-0014](../../../docs/adr/0014-tailwind-and-shadcn-ui.md) (Tailwind + shadcn),
  [ADR-0015](../../../docs/adr/0015-native-controls-on-the-field-route.md) (native
  controls on the field route),
  [ADR-0018](../../../docs/adr/0018-one-form-stack.md) (react-hook-form everywhere).

## 2. What is fixed

| Axis | The answer | Where |
|---|---|---|
| Colour | Tokens from the `@theme` block, never a hex | `src/client/styles/app.css` |
| Type | Archivo Variable, `--text-display` scale | same |
| Spacing | `--spacing-touch` (3rem), `--spacing-decision` (3.5rem), `--spacing-row` | same |
| Elements | Vendored shadcn | `src/client/ui/` |
| Words | French, from `copy.ts`, never inline | `src/client/copy.ts` |

Rules that are easy to break by accident, all from `design.md`:

- **Gold is a fill, never text and never a focus ring.**
- **Status reads down a row's leading edge** (`STATUS_EDGE` / `STATUS_TEXT` in
  `src/client/admin/status.ts`), not as a coloured pill in a column.
- **Nothing is wrapped in a card on the admin side.**
- **One toolbar slot** (§128) — a screen gets one, not a row of them.
- Sentence case. Active verbs. An action keeps its name through the flow:
  *Assigner* → *Assigné*. Errors say what happened **and** what to do.

## 3. Compose, do not hand-roll

Use the vendored element. If shadcn provides it and `src/client/ui/` does not
have it, `pnpm dlx shadcn add <name>` and then **fix it to this repo's
conventions before committing**: `@/lib/utils` for `cn`, the `radix-ui/<part>`
subpath rather than the barrel, prettier, and every English string it ships
replaced with French from `copy.ts` (INVARIANT 15). The CLI will offer to
overwrite `button.tsx` — refuse; it is customised. It has also been seen adding
a junk `cn` package to `package.json`; check the diff.

**On the field route only**, ADR-0015 lets a native element replace a shadcn one
whose dependencies breach the bundle budget. Every use of that exception cites a
measurement in the PR. `src/client/ui/field-controls.tsx` is the worked example.

## 4. The field side is a different brief

- **One decision per screen** (§279). The today list asks *which door*; the visit
  form asks *what happened*. Nothing competes with that one question.
- One thumb, outdoors, in a hurry, possibly with no signal. 48 px minimum target,
  set in the vendored component rather than per screen.
- Sync is ambient, never a toast (§342) — a pending count is a standing fact for
  hours, not a four-second event.
- The date input looks like the OS. That is ADR-0015, not a bug (§393).

## 5. Plan, check, build, record

1. **Plan** in prose plus an ASCII wireframe, the way `design.md` already does
   it. Name the one thing the screen is for and what is subordinate to it.
2. **Check the plan against the brief.** The failure mode here is not a generic
   palette — it is *a screen that ignores the rules above*, or that asks two
   questions where the domain asks one. Also check: would this work at 320 px,
   with a keyboard, and with `prefers-reduced-motion`?
3. **Build it**, composing from `src/client/ui/`.
4. **Record it in `docs/design.md`** in the same change — wireframe plus the rule
   it encodes, not a description of the code. The next person reads that file,
   not the diff.

## 6. Before you call it done

- [ ] No hex, no hardcoded spacing, no per-component CSS file.
- [ ] No French string outside `copy.ts`.
- [ ] Keyboard reachable; visible focus; `role="alert"` on anything announced.
- [ ] Field route touched? Report the **entry chunk gzip and the precache total**
      (`vision.md` asks for both) against the 150 kB budget.
- [ ] `docs/design.md` updated.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

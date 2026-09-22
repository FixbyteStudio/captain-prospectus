# ADR-0019: Keep the admin chunk out of the service worker precache

- Status: proposed
- Date: 2026-09-22
- Deciders: owner

## Context

The service worker precaches everything the build emits —
`globPatterns: ["**/*.{js,css,html,svg,woff2}"]` in `vite.config.ts`. That glob
predates the route split, and it has quietly made every field agent pay for the
admin app.

Measured on `main` before this change:

```
precache  15 entries (893.57 KiB)
  assets/index-*.js        448.60 kB   the entry chunk — the field app
  assets/AdminApp-*.js     298.65 kB   TanStack Query, Radix, sonner, PapaParse
  assets/index-*.css        55.34 kB
  assets/input-*.js         44.50 kB   react-hook-form, shared with the field forms
  archivo …woff2            34.93 kB
  … 10 smaller entries
```

**A third of what a phone downloads on install is an app that phone will never
open.** `AdminApp-*.js` is 298.65 kB of the 893.57 KiB total, and
[ADR-0014](0014-tailwind-and-shadcn-ui.md)'s own bundle note already named this
shape of problem: "a lazy chunk defers bytes, it does not save them, since the
service worker precaches all of them" ([vision.md](../vision.md)).

Two facts make the admin chunk different from the field ones:

- **It is already unreachable offline.** `src/client/App.tsx` computes
  `isAdmin = me.role === "admin" && !offline`, where `offline` means `/api/me`
  could not be reached and the identity came from the Dexie cache. An admin with
  no network is shown the field side, whatever role the cached identity records
  (`docs/domains/identity-access.md`). Precaching the chunk buys nothing, because
  the router will not render it.
- **Every admin screen is a network screen.** The prospect list, the import, the
  duplicate sweep, the script editor and the live feed are all a query away from
  D1. There is no offline admin experience to preserve — unlike the round, the
  visit form and the outbox, which are the entire point of ADR-0007.

[M4](../roadmap.md) is about to make it worse by adding Leaflet (~44 kB gzipped)
to that chunk. vision.md's standing rule is "if either number moves the wrong
way, settle it before adding to it", so this is settled first.

## Decision

We will **precache the field app only**. `vite.config.ts` gains
`globIgnores: ["**/assets/AdminApp-*.js"]`, and the admin chunk is fetched from
the network the first time an admin opens `/admin/*`.

Vite already emits the whole admin side as that one chunk — Radix, TanStack
Query, sonner and PapaParse are bundled inside it rather than in a shared vendor
chunk — so one glob is the whole change. No `manualChunks` configuration is
needed, and none is added: a hand-written chunking function would be a second
thing to keep true.

The shared `assets/input-*.js` chunk **stays precached**. It holds
react-hook-form, which [ADR-0018](0018-one-form-stack.md) put on both sides, and
the field visit form needs it with no signal.

## Alternatives considered

| Option | Why not |
|---|---|
| Leave it as it is | A third of the install is dead weight on the one connection this project optimises for, and M4 adds Leaflet to it |
| `manualChunks` to group admin deps under a stable name first | Solves a problem we do not have: the build already emits one `AdminApp-*.js`. It would add a chunking function to maintain for no change in output |
| Precache the admin chunk but with a runtime `NetworkFirst` rule | INVARIANT 8 keeps `runtimeCaching: []` deliberately empty, and this would reintroduce the cached-response class of bug for no offline benefit |
| Split the admin side into several lazy chunks instead | Defers bytes rather than removing them — the same mistake ADR-0014's note already records. Orthogonal, and can still be done later |

## Consequences

- **The precache drops from 893.57 KiB to ~601.9 KiB**, about a third. Re-measure
  and record the exact figure in vision.md, which is the file that carries both
  numbers.
- **The entry chunk is unchanged.** This ADR does not touch the 150 kB budget,
  which governs first paint; it moves the *other* number vision.md asks for.
- **An admin on a failing connection can now fail to open `/admin/*`.** The
  chunk is a network fetch, and `App.tsx`'s `Suspense` fallback renders an empty
  `aria-busy` paragraph with no error path or retry — so a failed chunk fetch
  hangs as a blank screen rather than saying so. That is a **known gap this ADR
  accepts and does not close**; it wants an error boundary around the admin
  `Suspense`, which is its own change.
- **A new admin-only lazy chunk would silently be precached again**, because the
  glob names `AdminApp-*` rather than expressing "admin-only". `config.test.ts`
  asserts the ignore exists; it cannot assert that it is still sufficient. Any PR
  that adds a second admin chunk has to widen the glob.
- Leaflet, arriving in M4, lands inside `AdminApp-*.js` and so costs a field
  phone nothing.

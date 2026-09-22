# Vision

## Problem
Field canvassing of restaurants and food trucks is run from spreadsheets and memory. Nobody knows in real time who was visited, what they said, or when to go back.

## Users
| Role | Count | Device | Needs |
|---|---|---|---|
| Admin | 1–2 | Laptop | Import prospects, assign them, edit the question script, watch visits live |
| Field agent | 2 | Phone, often poor signal | Today's list ordered by distance, a fast visit form, works offline, add new places |

## Where
**Brussels.** The first deployment canvasses the Brussels-Capital Region, which is why the
import map opens on the Grand-Place (`src/client/admin/import/map.ts`), why the local seed
invents Brussels restaurants, and why the Google Places request sends `regionCode: "BE"`
([ADR-0020](adr/0020-google-places-as-a-second-map-provider.md)). Nothing in the data model
is tied to a city — moving is changing those three places, not a migration.

## Core jobs
1. **Build the prospect base** from a CSV or an area drawn on a map.
2. **Assign** prospects to agents.
3. **Visit**: agent checks in, gives a flyer, answers scripted questions, records an outcome.
4. **Revisit**: prospects needing follow-up come back on the agent's list.
5. **Discover**: agents add prospects not in the base.
6. **Monitor**: admin sees visits as they sync.

## Non-goals (v1)
- PDF import (dropped, see [ADR-0009](adr/0009-no-pdf-import.md)).
- Route optimisation beyond nearest-next ordering.
- Continuous GPS tracking of agents. Position is captured at check-in only.
- Multi-organisation / multi-tenant.
- Native mobile apps.
- Any paid service.

## Success criteria
- An agent can complete a visit with zero network in under 60 seconds.
- A visit logged offline reaches the admin within 1 minute of the phone regaining signal.
- Monthly infrastructure bill: 0.
- **The field route's JavaScript stays under 150 kB gzipped.** The budget
  [ADR-0014](adr/0014-tailwind-and-shadcn-ui.md) asks for. An agent loads this app outdoors on a bad
  connection, so the admin side — TanStack Query, Radix, sonner, PapaParse — is a separate chunk that
  a phone never fetches.

  Measured at the end of M1: 126 kB gzipped for the entry chunk, 100 kB more for the admin chunk that
  only an admin loads. **Measured at the end of M2: 158 kB — over budget**, after the split ADR-0014's
  own consequence asks for (`VisitScreen` and `AddProspectScreen` are now a lazy chunk of their own;
  the round itself stays in the entry chunk, since that is what an agent needs the instant the app
  opens). Splitting bought back only ~2 kB, because the actual overage is not those two screens.

  It is `zod`. The M1 figure never counted it: `sync.ts` already imported
  `syncResponseSchema` to validate the server's response before trusting it enough to clear an outbox
  row (the mechanism behind INVARIANT 5), but nothing in the entry chunk actually **called** `runSync`
  — M1 wired the engine and M2's real job was wiring it to the app, which is exactly what makes that
  import, and the ~30 kB gzipped `zod` brings with it, reachable for the first time. The rest of M2's
  new screens compound it: [ADR-0015](adr/0015-native-controls-on-the-field-route.md) validates visit
  and field-prospect drafts against the same shared schemas rather than a form library, which is
  cheaper than `react-hook-form` but not free.

  This is a real, measured number, not a rounding error to wave off, and it was closed in M3's
  first change rather than carried. **Measured after [ADR-0017](adr/0017-zod-mini-for-the-shared-wire-contract.md):
  141.95 kB — under budget.** Attributing the chunk through its sourcemap found the hypothesis above
  half wrong: splitting `src/shared/schemas.ts` was worth about 1 kB, because rolldown already
  tree-shakes the schemas a field screen never imports — all of them together are 3.2 kB raw. The
  overage was zod's *runtime*, 27.8 kB gzipped of it, including 17 kB raw of JSON-Schema conversion
  the app never calls. Writing the contract in `zod/mini` — same core, same `issues`, one definition
  still serving both sides — takes that to 9.6 kB and the entry chunk to 141.95 kB. The Worker bundle
  fell 110.26 → 83.93 kB in the same change, and the PWA now precaches 782 KiB rather than 842 KiB.

  **Measured again after [ADR-0018](adr/0018-one-form-stack.md)** — react-hook-form adopted for every
  form, the field route included — **142.04 kB, still under budget.** It lands in the shared chunk of
  the two lazy field screens rather than the entry chunk. That is worth stating precisely, because
  ADR-0015 made the point first: a lazy chunk defers bytes, it does not save them, since the service
  worker precaches all of them. On that fuller measure the field route is **164.71 kB**, against
  149.12 kB after ADR-0017 and 165.95 kB at the end of M2 — ADR-0017's win paid for react-hook-form
  almost exactly, and the total is a kilobyte below where M2 left it.

  **Quote both numbers from here on**: the 150 kB budget governs the entry chunk, which is how it has
  been measured at every milestone, and the precache total is what an agent's connection actually
  experiences. Re-measure whenever the field screens grow; if either number moves the wrong way,
  settle it before adding to it.

  **Re-measured at the start of M4, and both figures above had drifted.** The entry chunk is
  **143.29 kB**, not the 142.04 kB recorded after ADR-0018: M3's script answers in the visit form
  (`src/shared/answers.ts` and the controls that render them) cost 1.25 kB, which nothing measured at
  the time. Still under budget, but the headroom is **6.7 kB**, not the 8 kB claimed above. The
  precache total had drifted further — **893.57 KiB**, not 782 KiB — for the same reason plus the
  admin side's own growth, since every chunk is precached whether or not a phone can open it.

  That second number is what [ADR-0019](adr/0019-admin-chunk-out-of-the-precache.md) settles, before
  M4 adds Leaflet to the admin chunk rather than after. `AdminApp-*.js` was 298.65 kB of the total —
  TanStack Query, Radix, sonner and PapaParse, for an app `App.tsx` refuses to render without a
  network anyway. Ignoring it in the Workbox glob takes the precache to **601.92 KiB across 14
  entries**, a third less, and leaves the entry chunk untouched at 143.29 kB. The lesson is in the
  drift itself: both numbers are only true on the day someone runs `pnpm build` and reads them.

  **Measured again after M4's map import**, which adds Leaflet: **entry chunk 143.93 kB, precache
  604.59 KiB.** Leaflet costs 45.7 kB gzipped and all of it lands in `AdminApp-*.js` (90.87 →
  136.58 kB gzipped), so a field phone pays none of it — which is the whole point of doing ADR-0019
  first. The entry chunk still moved, by 0.47 kB, and not because of the map: `copy.ts` is one object
  in the entry chunk and the map's French strings ride along with it
  ([issue #20](https://github.com/FixbyteStudio/captain-prospectus/issues/20)). Headroom is now
  **6.2 kB**. That issue stops being cosmetic the next time a screen adds copy.

# Vision

## Problem
Field canvassing of restaurants and food trucks is run from spreadsheets and memory. Nobody knows in real time who was visited, what they said, or when to go back.

## Users
| Role | Count | Device | Needs |
|---|---|---|---|
| Admin | 1–2 | Laptop | Import prospects, assign them, edit the question script, watch visits live |
| Field agent | 2 | Phone, often poor signal | Today's list ordered by distance, a fast visit form, works offline, add new places |

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

  This is a real, measured number, not a rounding error to wave off — and closing it properly (a
  lighter validation path, or splitting `src/shared/schemas.ts` so a field screen does not pull in
  admin-only schemas it never imports) is its own piece of work, tracked as
  [backlog/004](backlog/004-field-bundle-budget.md) rather than rushed into this change. Re-measure
  whenever the field screens grow; if the entry chunk crosses whatever the current budget is, split
  further before adding to it.

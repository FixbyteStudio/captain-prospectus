# ADR-0020: Google Places as a second map-import provider

- Status: proposed
- Date: 2026-09-22
- Deciders: the owner

## Context

[ADR-0008](0008-map-import-via-overpass.md) chose Overpass for the map import and
predicted its weakness: "data completeness depends on OSM coverage in the target city;
food trucks are rarely mapped." M4 shipped that import and the prediction held. The
places OSM knows about in the target area are patchy, and some of what it knows is
years old.

[ADR-0002](0002-zero-cost-constraint.md) made that weakness unfixable by construction:
no paid APIs, and Google Places was rejected there and in ADR-0008 for exactly that
reason. CLAUDE.md turned it into invariant 1.

Since then the owner has acquired a Google Cloud billing account and a Places API key,
and has decided to accept both the cost and the licence terms in order to get better
data. That is a decision only the owner can make, and they have made it.

Facts that shape what can be built, from Google's own documentation on 2026-09-22:

- Nearby Search (New) is `POST https://places.googleapis.com/v1/places:searchNearby`,
  authenticated with an `X-Goog-Api-Key` header and requiring an `X-Goog-FieldMask`.
- Its `locationRestriction` accepts a **circle** — a centre and a radius of up to
  50 000 m. There is no polygon search anywhere in the Places API.
- `maxResultCount` caps at **20**, and Nearby Search has no page tokens. Twenty places
  per call is the ceiling, not a default.
- The field mask decides the SKU. On Nearby Search even `places.id` bills at **Pro**;
  `nationalPhoneNumber`, `internationalPhoneNumber` and `websiteUri` are **Enterprise**,
  which has a smaller free allowance and a higher price per call.
- Table A has no `food_truck` type.
- Google retired the universal $200 monthly credit in March 2025. Free usage is now a
  per-SKU monthly call count.

## Decision

We will add Google Places as an **optional second provider** on the existing map import
screen, chosen from a dropdown, and we will amend ADR-0002 and ADR-0008 to allow it.

1. **ADR-0002 is amended.** Zero cost stops being absolute. The rule becomes: no service
   that can bill us without the owner's explicit, per-service consent, recorded in an ADR
   with its free-tier limits and our expected usage in
   [free-tier-budget.md](../free-tier-budget.md). Google Places is the first and, so far,
   only service to have that consent. Everything else in ADR-0002 stands.

2. **ADR-0008 is amended, not reversed.** Overpass remains the default provider and keeps
   the polygon. Google Places sits beside it, behind the same Worker route pattern, the
   same cache table, the same candidate shape and the same preview — one pipeline, now
   three sources.

3. **Google searches a circle**, because that is the only shape its API accepts. The map
   canvas draws a polygon for Overpass and a circle for Google.

4. **One circle is one call**: `maxResultCount: 20` with `rankPreference: DISTANCE`, so
   the twenty returned are the twenty nearest the centre, and the response says it was
   truncated. We do not tile a large circle into many small ones.

5. **The field mask stays inside Pro**: `places.id`, `places.displayName`,
   `places.formattedAddress`, `places.location`, `places.primaryType`. Google-sourced
   prospects arrive with no phone and no website.

6. **`source_ref` is `google/<placeId>`**, so tier 1 of the dedupe key
   ([prospecting.md](../domains/prospecting.md)) works for Google exactly as
   `node/123` does for OSM.

7. **The key is a Worker secret.** `GOOGLE_PLACES_KEY` is set with
   `wrangler secret put`, never in `wrangler.jsonc`, and the browser never sees it — the
   same rule INVARIANT 11 already applies to Overpass, for a stronger reason.

8. **The provider is off until a key exists.** With no key the route answers 503 and the
   screen says so. A fork of this repo with no billing account keeps working exactly as
   it does today.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep Overpass only | The data problem is real and the owner has decided to pay to fix it. This ADR exists because that decision was made. |
| Replace Overpass with Google | Overpass is free, unlimited in practice, has no 20-result cap and no licence restriction on storing what it returns. Losing it to gain freshness is a bad trade, and it would make the whole import depend on a billing account. |
| Tile one drawn circle into many sub-circles | Multiplies the bill by the number of tiles, needs cross-tile de-duplication, and the parsing would run into the Workers Free 10 ms CPU budget. A smaller circle is a better answer than a cleverer one. |
| Include phone and website in the field mask | Both are Enterprise-tier fields, so asking for them moves *every* search — including ones that return nothing — onto the smaller free allowance and the higher price. Phone numbers come from CSV, OSM, or an agent in the field. |
| Text Search instead of Nearby Search | Its `locationRestriction` is a rectangle, and 60 results costs three billable calls. A circle the admin draws is the shape the owner asked for. |
| Call Places from the browser | The key would be public, there would be no cache, and every keystroke would be billable. |

## Accepted risks

Stated once here, and not re-argued in code comments:

- **Storage.** Google Maps Platform terms allow caching Places content for up to 30 days
  — our cache TTL is 7, so that part is satisfied — but importing names and addresses
  into `prospects` stores them indefinitely, which the terms do not permit.
- **Base map.** The terms expect Places content to be displayed on a Google map. Ours is
  OpenStreetMap tiles. We show a "Powered by Google" line on the results panel, which is
  the part of the attribution requirement we can honour while using OSM tiles.

The owner has read both and accepted them. This is a private tool for one small team,
not a commercial product, and the feature is opt-in and inert without a key.

## Consequences

- **A map search can now cost money.** The cache stops being only etiquette towards a
  donated public service and becomes a way of not paying twice for the same circle.
- **Twenty places per circle is a product limit**, not a bug. In a dense centre the
  admin draws several small circles instead of one large one, and the screen says so.
- **Food trucks are still not solved.** Google has no food-truck type either. They will
  keep coming from CSV or from agents in the field.
- **The same restaurant can be imported twice**, once from each provider, because tier 1
  of the dedupe key is keyed on the source's own id and `node/4711` is not
  `google/ChIJ…`. The duplicates sweep and the merge screen already exist for this; we
  do not weaken tier 1 to avoid it.
- **`overpass_cache` now holds two providers' bodies.** The table keeps its name — the
  hash is prefixed with a query version per provider, so entries cannot collide — and
  it still has no eviction path (issue #25), which a second writer makes slightly more
  pressing.
- **Deployment gains an optional step.** Someone setting this up without a Google
  account skips it and loses nothing they had before.

# Ingestion

Two sources, one pipeline — and the map source has two providers:

```
source → candidates (browser) → admin preview & mapping → POST /api/admin/prospects/batch → upsert by dedupe key
```

The admin always sees a preview before anything is written.

## CSV import
- Parsed **in the browser** (PapaParse). The file never leaves the laptop and is never stored.
- Admin maps columns → fields: `name` (required), `type`, `lat`, `lng`, `address`, `phone`, `website`, `cuisine`, `sourceRef`.
- The mapping is **guessed first** from the headers, against a list of French and English spellings, and the admin corrects it. Exact header matches are claimed before fuzzy ones, so "Nom du contact" cannot take `name` while a plain "Nom" column sits unclaimed. A header we do not recognise is left unmapped rather than guessed at.
- **The first row's value is shown under every field.** That is what makes a mapping checkable in one pass instead of matching two lists of words and hoping.
- A column left unmapped **sends nothing**, and a re-import leaves that field as it was. Mapping nothing to `phone` does not erase the phone numbers already stored (see [prospecting](prospecting.md#rules)).
- Mapping a column to `sourceRef` is worth doing when the file has a stable id: tier 1 of the dedupe key is the only one that survives a rename.
- Decimal coordinates written with a comma (`45,7578`) are read correctly — that is what a French spreadsheet exports.
- A `type` value we do not recognise falls back to `other` rather than rejecting the row.
- Rows without `name` are rejected in the preview with a reason, and shown **first**, so the problems are read before they are scrolled past. Their address is still displayed, so the admin can find the line in their spreadsheet.
- The preview validates with the same zod schema the Worker uses, so it rejects exactly what the Worker would. There is no second opinion and no surprise 400 after the admin has approved the import.
- Rows without coordinates are allowed. They appear on the agent's list without distance ordering. Geocoding is out of scope for v1.
- Sent in batches of up to **250 rows per request**; the Worker chunks inserts further for D1's
  100-bound-parameter limit. The cap is set by the Workers Free **10 ms CPU** budget per invocation,
  not by payload size: validating and normalising a row costs CPU. A 2000-row import is ~8 requests,
  negligible against 100,000/day ([free-tier-budget](../free-tier-budget.md)).
- Batches go **in order, one at a time**, with a progress line. If one fails, the admin is told that
  the rows already sent are stored and that resending the whole file is safe — which is true, because
  the upsert is keyed on the dedupe key.
- The result says what happened in the app's own words: created, updated, and how many lines were
  rejected. It never reports "skipped" for a row that matched an existing prospect — that is an
  update, and it is the point of re-importing.

## Map import
Two providers behind one screen: OpenStreetMap via Overpass
([ADR-0008](../adr/0008-map-import-via-overpass.md)) and Google Places
([ADR-0020](../adr/0020-google-places-as-a-second-map-provider.md)). A dropdown above the
map chooses between them; **OpenStreetMap is the default**, so an exploratory redraw
costs nothing.

They differ only where Google forces them to:

| | OpenStreetMap | Google Places |
|---|---|---|
| Shape | Polygon, 3–200 vertices | Circle, 50–2000 m radius |
| Route | `POST /api/admin/import/overpass` | `POST /api/admin/import/places` |
| Results | Up to 1000, then `truncated` | **20**, hard cap, then `truncated` |
| Cost | Free | Billable per search |
| Key | None | `GOOGLE_PLACES_KEY`, a Worker secret |
| `source` | `osm` | `google` |
| Phone / website | Yes | No — Enterprise-tier fields |

Everything after the search is identical: the same candidate shape, the same panel, the
same preview, the same `POST /api/admin/prospects/batch`. **The browser never calls
either provider directly** (INVARIANT 11) — that is what makes the cache possible for
Overpass and what keeps the key out of the page for Google.

### OpenStreetMap (Overpass)

1. Admin draws a polygon on a Leaflet map (OSM tiles).
2. Client sends the polygon to `POST /api/admin/import/overpass`.
3. Worker builds the Overpass QL query, hashes the normalised polygon, returns the cached result if younger than 7 days, otherwise queries Overpass and caches.
4. Response is mapped to candidates and shown in the same preview as CSV.

### Query
```
[out:json][timeout:25];
(
  nwr["amenity"~"^(restaurant|fast_food|cafe|bar|ice_cream)$"](poly:"<lat lon …>");
  nwr["street_vendor"](poly:"<lat lon …>");
);
out center;
```

### Tag mapping
| OSM | Field |
|---|---|
| `type/id` | `source_ref` |
| `name` | `name` (may be empty; see "unnamed elements" below) |
| `lat/lon` or `center` | `lat`, `lng` |
| `amenity` | `type` (`street_vendor` present → `food_truck`) |
| `addr:housenumber` + `addr:street` + `addr:city` | `address` |
| `phone` / `contact:phone` | `phone` |
| `website` / `contact:website` | `website` |
| `cuisine` | `cuisine` |

### Unnamed elements
This is an OSM problem; Google always sends a display name. OSM holds plenty of amenities with no `name`. They are **returned and shown**, so
the admin sees what the area really contains, but they are **not importable**:
`name` is required by `importRowSchema`, so a nameless candidate is listed with
the reason « Sans nom » and excluded from the count, exactly as the CSV preview
treats a line with no name. Naming one inline is a separate feature and is not in
v1 (`docs/design.md`, "The map import").

### Google Places

1. Admin places a circle: one click for the centre, one for the radius, then handles to
   move or resize it. A circle rather than a polygon because Nearby Search has no polygon
   search — that is the whole reason the two providers draw differently.
2. Client sends `{center, radius}` to `POST /api/admin/import/places`.
3. Worker checks the key, hashes the normalised centre and radius, returns the cached
   result if younger than 7 days, otherwise calls Nearby Search and caches. With no key
   it answers **503** and the screen says the provider is not configured.

#### Request
```
POST https://places.googleapis.com/v1/places:searchNearby
X-Goog-Api-Key: <secret>
X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types

{
  "includedTypes": ["restaurant", "fast_food_restaurant", "cafe", "coffee_shop",
                    "bar", "pub", "meal_takeaway", "ice_cream_shop", "food_court"],
  "maxResultCount": 20,
  "rankPreference": "DISTANCE",
  "languageCode": "fr",
  "regionCode": "FR",
  "locationRestriction": { "circle": { "center": {...}, "radius": <metres> } }
}
```

**The field mask is the bill.** Every field above is Pro-tier on Nearby Search;
`nationalPhoneNumber`, `internationalPhoneNumber` and `websiteUri` are Enterprise, and
asking for one moves *every* search — including one that finds nothing — onto a smaller
free allowance and a higher price. Nothing in the response reveals this, so
`places.test.ts` pins it.

#### Field mapping
| Google | Field |
|---|---|
| `google/<id>` | `source_ref` |
| `displayName.text` | `name` |
| `location.latitude/longitude` | `lat`, `lng` |
| `primaryType`, falling through to `types` | `type` |
| `formattedAddress` | `address` |
| the `<kitchen>_restaurant` type prefix | `cuisine` |
| — | `phone`, `website` are always null |

`primaryType` alone is not enough: a pizzeria comes back as `pizza_restaurant`, which is
in no table of ours, but its `types` also contain `restaurant`. Falling through to the
array is what stops every specialised kitchen becoming `other`. Reading the kitchen out of
the type name fills `cuisine` in the same English vocabulary OSM uses, so the two
providers' prospects stay comparable.

**An empty circle is `{}`, not `{"places": []}`.** Google omits the key entirely, so a
missing `places` is zero results and not a malformed answer.

#### Limits
- **20 results per search, and no next page.** That is Google's ceiling, not a setting.
  `rankPreference: DISTANCE` makes a truncated answer a ring around the pin rather than an
  arbitrary subset, so shrinking the circle is a meaningful response, and the screen says
  so. One circle is one call: we do not tile a large one into many small ones (ADR-0020).
- Radius 50–2000 m. Google allows 50 km, which behind a 20-result cap is a bigger area to
  be silently wrong about.
- **No food trucks.** Table A has no `food_truck` type, so Google does not fix that gap
  either — they still come from CSV or from an agent in the field.
- A search is billable; the cache is how a redraw of the same circle is not.

### Duplicates across providers
The same restaurant found through both providers **imports twice**. Tier 1 of the dedupe
key is the source's own id (see [prospecting](prospecting.md)), and `node/4711` is not
`google/ChIJ…`, so nothing merges them automatically. That is deliberate: tier 1 is the
only tier that survives a rename, and weakening it to catch this would cost more than it
saves. The duplicates sweep and the merge screen already exist for exactly this pair.

### Limits and etiquette
- Polygon: 3–200 vertices. Circle: 50–2000 m.
- Food trucks are weakly mapped in OSM. Expect most of them to come from CSV or from agents in the field.
- Coverage varies by city. Validate on the real target area before relying on it.
- Overpass is a shared public service: cache, no automatic retries in loops, identify the app in `User-Agent`.
- Attribution "© OpenStreetMap contributors" on the map and any export — the tiles are
  OSM's whichever provider was searched. Google's results carry "Résultats fournis par
  Google" in the panel beside them.

# Ingestion

Two sources, one pipeline:

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

## Map import (OpenStreetMap via Overpass)
See [ADR-0008](../adr/0008-map-import-via-overpass.md).

1. Admin draws a polygon on a Leaflet map (OSM tiles).
2. Client sends the polygon to `POST /api/admin/import/overpass`. The browser never calls Overpass directly.
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
| `name` | `name` (elements without a name are shown but unchecked by default) |
| `lat/lon` or `center` | `lat`, `lng` |
| `amenity` | `type` (`street_vendor` present → `food_truck`) |
| `addr:housenumber` + `addr:street` + `addr:city` | `address` |
| `phone` / `contact:phone` | `phone` |
| `website` / `contact:website` | `website` |
| `cuisine` | `cuisine` |

### Limits and etiquette
- Polygon: 3–200 vertices.
- Food trucks are weakly mapped in OSM. Expect most of them to come from CSV or from agents in the field.
- Coverage varies by city. Validate on the real target area before relying on it.
- Overpass is a shared public service: cache, no automatic retries in loops, identify the app in `User-Agent`.
- Attribution "© OpenStreetMap contributors" on the map and any export.

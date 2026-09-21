# Ingestion

Two sources, one pipeline:

```
source → candidates (browser) → admin preview & mapping → POST /api/admin/prospects/batch → upsert by dedupe key
```

The admin always sees a preview before anything is written.

## CSV import
- Parsed **in the browser** (PapaParse). The file never leaves the laptop and is never stored.
- Admin maps columns → fields: `name` (required), `type`, `lat`, `lng`, `address`, `phone`, `website`, `cuisine`.
- Rows without `name` are rejected in the preview with a reason.
- Rows without coordinates are allowed. They appear on the agent's list without distance ordering. Geocoding is out of scope for v1.
- Sent in batches of up to 2000 rows per request; the Worker chunks inserts for D1's parameter limit.

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

---
name: overpass-import
description: Work on the OpenStreetMap map import (Leaflet polygon, Overpass query, tag mapping, cache). Use when changing which places are imported, how OSM tags map to prospect fields, or the Overpass proxy.
---

# Overpass import

Reference: `docs/domains/ingestion.md`, ADR-0008.

- Overpass is called **only** from the Worker route `POST /api/admin/import/overpass`, never from the browser.
- Cache key: SHA-256 of the polygon with coordinates rounded to 5 decimals + the query version string. TTL 7 days in `overpass_cache`. Bump the query version when the query changes.
- Endpoint `https://overpass-api.de/api/interpreter`, POST `data=<urlencoded query>`, `[out:json][timeout:25]`, `out center;` so ways/relations get coordinates.
- `poly:` takes space-separated `lat lon` pairs.
- `source_ref` = `<type>/<id>` (e.g. `node/123`) — it drives dedupe; never change its format.
- Tag mapping table lives in the domain doc; keep code and doc identical.
- Unnamed elements: return them, flagged, unchecked by default in the preview.
- Failure (timeout, 429, 5xx): return 502 with a clear message; no automatic retry loops.
- Attribution "© OpenStreetMap contributors" on the map and exports.
- Test with a fixture JSON response, not the live API.

# ADR-0008: Map import via OpenStreetMap Overpass

- Status: accepted — amended by [ADR-0020](0020-google-places-as-a-second-map-provider.md)
- Date: 2026-09-21

## Context
The admin wants to build a prospect list by selecting an area on a map. Commercial places APIs cost money.

## Decision
We will let the admin draw a polygon on a Leaflet map with OSM tiles, and query the public Overpass API **through the Worker**, caching results in D1 by polygon hash for 7 days.

## Alternatives considered
| Option | Why not |
|---|---|
| Google Places | Paid, billing account required |
| Browser calls Overpass directly | No caching, no rate control |
| Nominatim search | Search engine, not designed for bulk area queries |

## Consequences
- Data completeness depends on OSM coverage in the target city; food trucks are rarely mapped.
- Must respect Overpass and OSM tile usage policies and show attribution.
- A public service may be slow or down; the import screen must show a clear error and allow retry.

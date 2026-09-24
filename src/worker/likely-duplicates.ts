/**
 * Which found places are probably already in the list — docs/domains/ingestion.md.
 *
 * The dedupe key cannot see these: tier 1 is the source's own id, and OSM's
 * `node/4711` is not Google's `google/ChIJ…` (ADR-0020). So the preview looks,
 * using the same rule as the duplicates sweep, and the admin decides. Nothing is
 * merged here and nothing is written.
 */
import { and, gte, lte } from "drizzle-orm";
import { DUPLICATES_SCAN_LIMIT } from "../shared/constants";
import { cellAndNeighbours, cellOf, distanceMeters } from "../shared/geo";
import type { Point } from "../shared/geo";
import type { AreaCandidate, FoundPlace } from "../shared/schemas";
import { SAME_PLACE_RADIUS_M, isProbablySamePlace } from "../shared/similarity";
import type { Db } from "./db/client";
import { prospects } from "./db/schema";

type Nearby = { id: string; name: string } & Point;

const METRES_PER_DEGREE_LAT = 111_320;

function located(place: FoundPlace): place is FoundPlace & Point {
  return typeof place.lat === "number" && typeof place.lng === "number";
}

/**
 * Mark each place with the live prospect it probably already is.
 *
 * One query: the prospects inside the places' bounding box, widened by the
 * same-place radius so a match just outside the box is not missed. Merged rows
 * are read too, but only for their `sourceRef`: a place whose ref an absorbed row
 * holds is a re-import that follows `merged_into`, not a new prospect.
 *
 * A place without coordinates is never marked. `isProbablySamePlace` would fall
 * back to an exact name match, and answering that means reading every prospect
 * with that name anywhere — not worth a full scan for the rare OSM element that
 * has no centre.
 */
export async function markLikelyDuplicates(
  db: Db,
  places: readonly FoundPlace[],
): Promise<AreaCandidate[]> {
  const unmarked = (place: FoundPlace): AreaCandidate => ({ ...place, likelyDuplicateOf: null });
  const locatedPlaces = places.filter(located);
  if (locatedPlaces.length === 0) return places.map(unmarked);

  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const p of locatedPlaces) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  const dLat = SAME_PLACE_RADIUS_M / METRES_PER_DEGREE_LAT;
  // A degree of longitude shrinks with latitude; size the margin at the edge
  // nearest a pole so it is wide enough everywhere in the box.
  const cosLat = Math.cos((Math.max(Math.abs(south), Math.abs(north)) * Math.PI) / 180);
  const dLng = dLat / Math.max(cosLat, 0.01);

  const rows = await db
    .select({
      id: prospects.id,
      name: prospects.name,
      lat: prospects.lat,
      lng: prospects.lng,
      sourceRef: prospects.sourceRef,
      mergedInto: prospects.mergedInto,
    })
    .from(prospects)
    .where(
      and(
        gte(prospects.lat, south - dLat),
        lte(prospects.lat, north + dLat),
        gte(prospects.lng, west - dLng),
        lte(prospects.lng, east + dLng),
      ),
    )
    // A CPU cap, like the sweep's. An area this dense is one to split anyway.
    .limit(DUPLICATES_SCAN_LIMIT);

  const knownRefs = new Set<string>();
  const buckets = new Map<string, Nearby[]>();
  for (const row of rows) {
    if (row.sourceRef !== null) knownRefs.add(row.sourceRef);
    // The range filter already excludes null coordinates; this tells the compiler.
    if (row.mergedInto !== null || row.lat === null || row.lng === null) continue;
    const nearby: Nearby = { id: row.id, name: row.name, lat: row.lat, lng: row.lng };
    const cell = cellOf(nearby);
    const bucket = buckets.get(cell);
    if (bucket) bucket.push(nearby);
    else buckets.set(cell, [nearby]);
  }

  return places.map((place) => {
    // An unnamed place cannot be imported, so there is nothing to warn about.
    if (!place.named || !located(place) || knownRefs.has(place.sourceRef)) {
      return unmarked(place);
    }

    let best: Nearby | null = null;
    let bestDistance = Infinity;
    for (const cell of cellAndNeighbours(place)) {
      for (const row of buckets.get(cell) ?? []) {
        if (!isProbablySamePlace(place, row)) continue;
        const d = distanceMeters(place, row);
        if (d < bestDistance) {
          best = row;
          bestDistance = d;
        }
      }
    }
    return best
      ? { ...place, likelyDuplicateOf: { id: best.id, name: best.name } }
      : unmarked(place);
  });
}

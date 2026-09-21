/** Distance and today-list ordering — docs/domains/field-operations.md. */

export type Point = { lat: number; lng: number };
export type MaybeLocated = { lat: number | null; lng: number | null };

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres. */
export function distanceMeters(a: Point, b: Point): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function located<T extends MaybeLocated>(item: T): item is T & Point {
  return typeof item.lat === "number" && typeof item.lng === "number";
}

/**
 * Greedy nearest-next ordering from the agent's position.
 *
 * Not a travelling-salesman solution and not meant to be (vision.md non-goals):
 * walk to the closest open prospect, then the closest one from there.
 * Prospects without coordinates keep their input order and go last.
 */
export function orderByNearestNext<T extends MaybeLocated>(items: readonly T[], from: Point): T[] {
  const remaining = items.filter(located);
  const unlocated = items.filter((i) => !located(i));

  const ordered: (T & Point)[] = [];
  let cursor: Point = from;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (!candidate) continue;
      const d = distanceMeters(cursor, candidate);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    if (!next) break;
    ordered.push(next);
    cursor = next;
  }

  return [...ordered, ...unlocated];
}

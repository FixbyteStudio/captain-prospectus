/**
 * The OpenStreetMap map import — ADR-0008, docs/domains/ingestion.md.
 *
 * Worker-only on purpose. `src/shared` holds contracts both sides import; a
 * query builder is not one, and the browser never talks to Overpass (INVARIANT
 * 11) so there is nothing here a client could need.
 *
 * Everything in this file is pure. The route does the I/O.
 */
import { OVERPASS_CANDIDATES_LIMIT, type ProspectType } from "../shared/constants";
import type { AreaCandidate } from "../shared/schemas";

/**
 * Part of the cache key, so a changed query cannot be served a stale answer
 * built by the old one. **Bump this whenever the QL below changes.**
 */
export const OVERPASS_QUERY_VERSION = "v1";

export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/**
 * Overpass asks callers to identify themselves so an abusive client can be
 * contacted rather than blocked (docs/domains/ingestion.md, "etiquette").
 */
export const OVERPASS_USER_AGENT =
  "CaptainProspectus/0.1 (+https://github.com/FixbyteStudio/captain-prospectus)";

/** `[lat, lng]`, as the wire contract sends it. */
export type Vertex = readonly [number, number];

/**
 * Five decimals is ~1 m — far below the precision anyone can draw with a mouse,
 * and enough that nudging the map between two searches still hits the cache.
 * The skill fixes this number; it is part of the key, so changing it silently
 * invalidates every cached answer.
 */
function round5(value: number): string {
  return value.toFixed(5);
}

/**
 * `poly:` takes space-separated `lat lon` pairs — not `lon lat`, and not commas.
 * Getting this backwards returns an empty set rather than an error, which is
 * why it has its own test.
 */
function polyClause(polygon: readonly Vertex[]): string {
  return polygon.map(([lat, lng]) => `${round5(lat)} ${round5(lng)}`).join(" ");
}

/**
 * The query from docs/domains/ingestion.md, verbatim. Code and doc must stay
 * identical — if you change one, change the other and bump the version above.
 *
 * `out center;` is what gives ways and relations a coordinate: without it a
 * mapped-as-a-building restaurant comes back with no position at all.
 */
export function buildOverpassQuery(polygon: readonly Vertex[]): string {
  const poly = polyClause(polygon);
  return [
    "[out:json][timeout:25];",
    "(",
    `  nwr["amenity"~"^(restaurant|fast_food|cafe|bar|ice_cream)$"](poly:"${poly}");`,
    `  nwr["street_vendor"](poly:"${poly}");`,
    ");",
    "out center;",
  ].join("\n");
}

/**
 * SHA-256 of the query version and the normalised polygon.
 *
 * Hashing the *rounded* coordinates rather than the raw ones is the whole point:
 * two drags that land a vertex a centimetre apart must be one cache entry, or
 * the cache never hits and every redraw is another request to a public service.
 */
export async function polygonHash(polygon: readonly Vertex[]): Promise<string> {
  const input = `${OVERPASS_QUERY_VERSION}:${polyClause(polygon)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------- tag mapping */

/** The shape Overpass returns with `[out:json]`. Only the parts we read. */
type OverpassElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: Record<string, unknown>;
};

const AMENITY_TO_TYPE: Readonly<Record<string, ProspectType>> = {
  restaurant: "restaurant",
  fast_food: "fast_food",
  cafe: "cafe",
  bar: "bar",
  // OSM's ice_cream is a shop that seats people; "other" is the honest bucket.
  ice_cream: "other",
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // `shortText` caps at 200; an OSM tag can be longer, and a 400 on an
  // untrimmed website URL would fail the whole import for one bad element.
  return trimmed === "" ? null : trimmed.slice(0, 200);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * `<type>/<id>`, e.g. `node/123` — **never change this format.** It is tier 1 of
 * the dedupe key, and the only tier that survives a rename
 * (docs/domains/prospecting.md), so a change here silently duplicates every
 * previously imported place on the next import.
 */
function sourceRef(element: OverpassElement): string | null {
  const { type, id } = element;
  if (typeof type !== "string" || typeof id !== "number") return null;
  return `${type}/${id}`;
}

/**
 * `addr:housenumber` + `addr:street` + `addr:city`, skipping what is missing —
 * most French OSM entries have the street and not the number.
 */
function address(tags: Record<string, unknown>): string | null {
  const parts = [
    [text(tags["addr:housenumber"]), text(tags["addr:street"])].filter(Boolean).join(" "),
    text(tags["addr:city"]),
  ].filter((part) => part !== "" && part !== null);
  return parts.length === 0 ? null : parts.join(", ").slice(0, 200);
}

/**
 * The tag mapping table in docs/domains/ingestion.md. Keep the two identical.
 *
 * `street_vendor` wins over `amenity`: a van that sells crêpes is tagged both
 * `amenity=fast_food` and `street_vendor=yes`, and "food truck" is the more
 * useful fact for someone walking a round.
 */
function toCandidate(element: OverpassElement): AreaCandidate | null {
  const ref = sourceRef(element);
  if (!ref) return null;

  const tags = element.tags ?? {};
  const name = text(tags.name);
  const amenity = text(tags.amenity);

  const type: ProspectType = tags.street_vendor
    ? "food_truck"
    : (AMENITY_TO_TYPE[amenity ?? ""] ?? "other");

  return {
    name: name ?? "",
    named: name !== null,
    type,
    lat: num(element.lat) ?? num(element.center?.lat),
    lng: num(element.lon) ?? num(element.center?.lon),
    address: address(tags),
    phone: text(tags.phone) ?? text(tags["contact:phone"]),
    website: text(tags.website) ?? text(tags["contact:website"]),
    cuisine: text(tags.cuisine),
    sourceRef: ref,
  };
}

/**
 * Map a raw Overpass response body to candidates.
 *
 * Returns `null` when the body is not an Overpass answer at all — a proxy error
 * page, an HTML rate-limit notice — which the route turns into a 502. An
 * element we cannot read is skipped rather than fatal: one malformed node must
 * not cost the admin the other forty-six.
 */
export function toCandidates(
  body: string,
): { candidates: AreaCandidate[]; truncated: boolean } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  const elements = (parsed as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return null;

  const candidates: AreaCandidate[] = [];
  for (const element of elements) {
    if (candidates.length >= OVERPASS_CANDIDATES_LIMIT) {
      return { candidates, truncated: true };
    }
    const candidate = toCandidate(element as OverpassElement);
    if (candidate) candidates.push(candidate);
  }
  return { candidates, truncated: false };
}

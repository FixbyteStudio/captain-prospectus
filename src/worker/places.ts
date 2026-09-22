/**
 * The Google Places map import — ADR-0020, docs/domains/ingestion.md.
 *
 * The second provider behind the same screen as `overpass.ts`, deliberately
 * built to mirror it: same shape of module, same purity, same contract with the
 * route, so the two can be read side by side. What differs is forced by Google
 * and not by us — a circle instead of a polygon, twenty results instead of a
 * thousand, and a call that costs money.
 *
 * Worker-only. The key must never be reachable from the browser, which is the
 * same rule INVARIANT 11 already applies to Overpass for a weaker reason.
 *
 * Everything here is pure. The route does the I/O.
 */
import { PLACES_MAX_RESULTS, type ProspectType } from "../shared/constants";
import type { AreaCandidate } from "../shared/schemas";
import type { Vertex } from "./overpass";

/**
 * Part of the cache key, so a changed request cannot be served a stale answer
 * built by the old one. **Bump this whenever the request below changes.**
 *
 * The `g` prefix is load-bearing: Google and Overpass answers share one table,
 * and two providers hashing the same numbers must not collide.
 */
export const PLACES_QUERY_VERSION = "gv1";

export const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

/**
 * The field mask decides the bill, not just the payload.
 *
 * Every field here is **Pro** tier on Nearby Search. `nationalPhoneNumber` and
 * `websiteUri` are Enterprise, which would move every search — including one
 * that finds nothing — onto a smaller free allowance and a higher price per
 * call (ADR-0020). Phone numbers come from CSV, from OSM, or from an agent
 * standing in front of the door.
 *
 * Google rejects a mask containing spaces, so this string has none.
 */
export const PLACES_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types";

/**
 * The same scope as the Overpass query in `overpass.ts`, in Google's vocabulary
 * (Place Types, Table A). `restaurant` also matches the cuisine-specific types
 * like `italian_restaurant`, which carry the broader type as well.
 *
 * There is no `food_truck` in Table A. Google cannot find them either
 * (ADR-0020) — that gap belongs to CSV and to the field.
 */
export const PLACES_INCLUDED_TYPES = [
  "restaurant",
  "fast_food_restaurant",
  "cafe",
  "coffee_shop",
  "bar",
  "pub",
  "meal_takeaway",
  "ice_cream_shop",
  "food_court",
] as const;

/** Same five decimals as the Overpass hash, and for the same reason. */
function round5(value: number): string {
  return value.toFixed(5);
}

/** Whole metres: a radius handle dragged a centimetre is the same search. */
function roundRadius(radius: number): number {
  return Math.round(radius);
}

/**
 * The Nearby Search request body.
 *
 * `rankPreference: DISTANCE` is what makes the 20-result cap survivable: when a
 * circle holds more than twenty places, the twenty returned are the twenty
 * nearest its centre rather than an arbitrary popular subset. A truncated
 * answer is then a ring around the pin, which is something an admin can reason
 * about and shrink.
 *
 * `languageCode` is French so display names arrive the way the admin and the
 * agents will read them. It does not change the SKU.
 */
export function buildPlacesBody(center: Vertex, radius: number): string {
  const [lat, lng] = center;
  return JSON.stringify({
    includedTypes: PLACES_INCLUDED_TYPES,
    maxResultCount: PLACES_MAX_RESULTS,
    rankPreference: "DISTANCE",
    languageCode: "fr",
    regionCode: "FR",
    locationRestriction: {
      circle: {
        center: { latitude: Number(round5(lat)), longitude: Number(round5(lng)) },
        radius: roundRadius(radius),
      },
    },
  });
}

/**
 * SHA-256 of the query version, the normalised centre and the rounded radius.
 *
 * Here the cache is not only etiquette: a hit is the difference between a
 * billable call and a free one, so nudging the pin between two searches must
 * land on the same entry.
 */
export async function circleHash(center: Vertex, radius: number): Promise<string> {
  const [lat, lng] = center;
  const input = `${PLACES_QUERY_VERSION}:${round5(lat)} ${round5(lng)}:${roundRadius(radius)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------ type mapping */

/** The parts of a Places result we ask for and read. */
type Place = {
  id?: unknown;
  displayName?: { text?: unknown };
  formattedAddress?: unknown;
  location?: { latitude?: unknown; longitude?: unknown };
  primaryType?: unknown;
  types?: unknown;
};

const GOOGLE_TYPE_TO_TYPE: Readonly<Record<string, ProspectType>> = {
  restaurant: "restaurant",
  fast_food_restaurant: "fast_food",
  meal_takeaway: "fast_food",
  cafe: "cafe",
  coffee_shop: "cafe",
  bar: "bar",
  pub: "bar",
  // A parlour with seats, like OSM's ice_cream: "other" is the honest bucket.
  ice_cream_shop: "other",
  food_court: "other",
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // `shortText` caps at 200 and a formatted address can run longer; a 400 on
  // one long address would fail the whole import.
  return trimmed === "" ? null : trimmed.slice(0, 200);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * `primaryType` first, then the broader `types` array.
 *
 * A pizzeria comes back as `primaryType: "pizza_restaurant"`, which is in no
 * table here, but its `types` also contain `restaurant`. Falling through to the
 * array is what stops every specialised kitchen becoming "other".
 */
function prospectType(place: Place): ProspectType {
  const primary = text(place.primaryType);
  const known = primary ? GOOGLE_TYPE_TO_TYPE[primary] : undefined;
  if (known) return known;

  if (Array.isArray(place.types)) {
    for (const value of place.types) {
      const name = text(value);
      const match = name ? GOOGLE_TYPE_TO_TYPE[name] : undefined;
      if (match) return match;
    }
  }
  return "other";
}

/**
 * Google encodes the kitchen in the type name — `italian_restaurant`,
 * `sushi_restaurant` — where OSM has a `cuisine` tag. Reading the prefix fills a
 * field that would otherwise always be null, in the same English vocabulary OSM
 * uses, so the two providers' prospects stay comparable.
 */
function cuisine(place: Place): string | null {
  const candidates = [text(place.primaryType), ...(Array.isArray(place.types) ? place.types : [])];
  for (const value of candidates) {
    const name = text(value);
    const match = name?.match(/^(.+)_restaurant$/);
    // `fast_food_restaurant` is a kind of place, not a kind of food.
    if (match?.[1] && match[1] !== "fast_food") return match[1];
  }
  return null;
}

/**
 * `google/<placeId>`, e.g. `google/ChIJN1t_tDeuEmsRUsoyG83frY4` — **never change
 * this format.** It is tier 1 of the dedupe key (docs/domains/prospecting.md),
 * so a change here silently duplicates every previously imported place on the
 * next import.
 */
function sourceRef(place: Place): string | null {
  const id = text(place.id);
  return id ? `google/${id}` : null;
}

function toCandidate(place: Place): AreaCandidate | null {
  const ref = sourceRef(place);
  if (!ref) return null;

  // Google always sends a display name for a place it returns. `named` stays
  // false-able anyway: the panel renders both providers, and a missing name is
  // a candidate we must show and refuse rather than one we may invent.
  const name = text(place.displayName?.text);

  return {
    name: name ?? "",
    named: name !== null,
    type: prospectType(place),
    lat: num(place.location?.latitude),
    lng: num(place.location?.longitude),
    address: text(place.formattedAddress),
    // Enterprise-tier fields, deliberately not requested (ADR-0020).
    phone: null,
    website: null,
    cuisine: cuisine(place),
    sourceRef: ref,
  };
}

/**
 * Map a raw Nearby Search body to candidates.
 *
 * Returns `null` when the body is not a Places answer at all — an `error`
 * object, a proxy page — which the route turns into a 502.
 *
 * **An empty result is `{}`, not `{"places": []}`.** Google omits the key
 * entirely when a circle holds nothing, so a missing `places` is zero results
 * and not a malformed answer. Reading it the other way would report every quiet
 * street as a provider failure.
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

  if (typeof parsed !== "object" || parsed === null) return null;
  const answer = parsed as { places?: unknown; error?: unknown };
  if (answer.error !== undefined) return null;

  const places = answer.places ?? [];
  if (!Array.isArray(places)) return null;

  const candidates: AreaCandidate[] = [];
  for (const place of places) {
    const candidate = toCandidate(place as Place);
    if (candidate) candidates.push(candidate);
  }

  // Google's cap, reached: the answer is a prefix of what the circle holds, and
  // there is no page token to ask for the rest.
  return { candidates, truncated: places.length >= PLACES_MAX_RESULTS };
}

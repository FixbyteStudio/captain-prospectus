import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { overpassCache } from "./db/schema";
import {
  PLACES_FIELD_MASK,
  PLACES_QUERY_VERSION,
  buildPlacesBody,
  circleHash,
  toCandidates,
} from "./places";
import { polygonHash } from "./overpass";
import { PLACES_CACHE_TTL_MS, PLACES_MAX_RESULTS } from "../shared/constants";
import type { AreaSearchResponse } from "../shared/schemas";

/**
 * The Google Places map import — ADR-0020, docs/domains/ingestion.md.
 *
 * Fixtures only, never the live API — here for a second reason on top of the
 * one in `overpass.test.ts`: every live call is billable, and a suite that hits
 * Google on each CI run would be a bill nobody reads until it arrives. `fetch`
 * is stubbed and its calls are counted, so a test that reaches the network
 * fails loudly.
 */

const ADMIN = "admin@example.com";
const AGENT = "agent@example.com";
const KEY = "test-key-not-a-real-one";

/** A circle over Lyon, the same ground the Overpass fixture covers. */
const CENTER: [number, number] = [45.764, 4.8357];
const RADIUS = 300;

async function call(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function search(body: unknown = { center: CENTER, radius: RADIUS }): Promise<Response> {
  return call("/api/admin/import/places", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * A plain restaurant, a pizzeria whose `primaryType` is in no table of ours, a
 * café, and a place with no `primaryType` at all.
 */
const FIXTURE = {
  places: [
    {
      id: "ChIJbouchon",
      displayName: { text: "Le Bouchon", languageCode: "fr" },
      formattedAddress: "12 rue des Capucins, 69001 Lyon, France",
      location: { latitude: 45.7638, longitude: 4.8355 },
      primaryType: "restaurant",
      types: ["restaurant", "food", "point_of_interest"],
    },
    {
      id: "ChIJvera",
      displayName: { text: "Pizza Vera", languageCode: "fr" },
      formattedAddress: "3 rue Royale, 69001 Lyon, France",
      location: { latitude: 45.7629, longitude: 4.8388 },
      primaryType: "pizza_restaurant",
      types: ["pizza_restaurant", "restaurant", "food"],
    },
    {
      id: "ChIJcafe",
      displayName: { text: "Café des Voraces", languageCode: "fr" },
      formattedAddress: "9 montée Saint-Sébastien, 69001 Lyon, France",
      location: { latitude: 45.7702, longitude: 4.8329 },
      primaryType: "coffee_shop",
      types: ["coffee_shop", "cafe", "food"],
    },
    {
      id: "ChIJmystery",
      displayName: { text: "Chez Personne", languageCode: "fr" },
      formattedAddress: "1 place Sathonay, 69001 Lyon, France",
      location: { latitude: 45.7681, longitude: 4.8332 },
      types: ["point_of_interest", "establishment"],
    },
  ],
};

let fetchCalls: { url: string; init: RequestInit | undefined }[] = [];

function stubPlaces(reply: () => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init });
    return Promise.resolve(reply());
  });
}

const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200 });

beforeEach(async () => {
  fetchCalls = [];
  env.GOOGLE_PLACES_KEY = KEY;
  await getDb(env.DB).delete(overpassCache);
});

afterEach(() => {
  vi.unstubAllGlobals();
  env.DEV_USER_EMAIL = ADMIN;
  delete env.GOOGLE_PLACES_KEY;
});

describe("buildPlacesBody", () => {
  it("sends a circle, because Nearby Search has no polygon search", () => {
    const body = JSON.parse(buildPlacesBody(CENTER, RADIUS)) as {
      locationRestriction: { circle: { center: { latitude: number; longitude: number } } };
    };
    expect(body.locationRestriction.circle).toEqual({
      center: { latitude: 45.764, longitude: 4.8357 },
      radius: 300,
    });
  });

  it("caps the result count at Google's ceiling and ranks by distance", () => {
    const body = JSON.parse(buildPlacesBody(CENTER, RADIUS)) as Record<string, unknown>;
    expect(body.maxResultCount).toBe(PLACES_MAX_RESULTS);
    // Without DISTANCE a truncated answer is an arbitrary subset; with it, the
    // twenty are a ring around the pin the admin can shrink (ADR-0020).
    expect(body.rankPreference).toBe("DISTANCE");
  });

  it("asks for the same scope as the Overpass query, and never a food truck", () => {
    const body = JSON.parse(buildPlacesBody(CENTER, RADIUS)) as { includedTypes: string[] };
    expect(body.includedTypes).toContain("restaurant");
    expect(body.includedTypes).toContain("fast_food_restaurant");
    expect(body.includedTypes).toContain("cafe");
    expect(body.includedTypes).toContain("bar");
    // Table A has no food_truck type. Asking for one is a 400 from Google.
    expect(body.includedTypes).not.toContain("food_truck");
  });

  it("rounds the radius to whole metres", () => {
    const body = JSON.parse(buildPlacesBody(CENTER, 300.4)) as {
      locationRestriction: { circle: { radius: number } };
    };
    expect(body.locationRestriction.circle.radius).toBe(300);
  });
});

describe("PLACES_FIELD_MASK", () => {
  it("stays inside the Pro tier, so a search is not billed as Enterprise", () => {
    // ADR-0020: these three are Enterprise fields. Adding one moves *every*
    // search onto a smaller free allowance and a higher price per call, which
    // nothing in the response would reveal.
    expect(PLACES_FIELD_MASK).not.toContain("nationalPhoneNumber");
    expect(PLACES_FIELD_MASK).not.toContain("internationalPhoneNumber");
    expect(PLACES_FIELD_MASK).not.toContain("websiteUri");
  });

  it("has no spaces, which Google rejects", () => {
    expect(PLACES_FIELD_MASK).not.toContain(" ");
    expect(PLACES_FIELD_MASK).toContain("places.id");
    expect(PLACES_FIELD_MASK).toContain("places.displayName");
  });
});

describe("circleHash", () => {
  it("is stable under jitter finer than 5 decimals, so a nudged pin is not a second bill", async () => {
    const nudged: [number, number] = [CENTER[0] + 0.000001, CENTER[1] - 0.000002];
    expect(await circleHash(nudged, RADIUS)).toBe(await circleHash(CENTER, RADIUS));
  });

  it("changes when the radius changes", async () => {
    expect(await circleHash(CENTER, RADIUS + 100)).not.toBe(await circleHash(CENTER, RADIUS));
  });

  it("cannot collide with an Overpass hash of the same numbers", async () => {
    // Both providers share `overpass_cache`. The version prefix is the only
    // thing keeping a Google answer out of an Overpass lookup.
    expect(PLACES_QUERY_VERSION).toBe("gv1");
    const triangle: [number, number][] = [CENTER, [45.765, 4.84], [45.762, 4.839]];
    expect(await circleHash(CENTER, RADIUS)).not.toBe(await polygonHash(triangle));
  });
});

describe("toCandidates", () => {
  it("maps every field in the ingestion.md table", () => {
    const bouchon = toCandidates(JSON.stringify(FIXTURE))?.candidates[0];
    expect(bouchon).toEqual({
      name: "Le Bouchon",
      named: true,
      type: "restaurant",
      lat: 45.7638,
      lng: 4.8355,
      address: "12 rue des Capucins, 69001 Lyon, France",
      // Enterprise-tier fields we deliberately do not buy (ADR-0020).
      phone: null,
      website: null,
      cuisine: null,
      sourceRef: "google/ChIJbouchon",
    });
  });

  it("falls through primaryType to types, so a pizzeria is not 'other'", () => {
    const vera = toCandidates(JSON.stringify(FIXTURE))?.candidates[1];
    expect(vera?.type).toBe("restaurant");
    // Google encodes the kitchen in the type name where OSM has a cuisine tag.
    expect(vera?.cuisine).toBe("pizza");
  });

  it("maps coffee_shop to cafe", () => {
    expect(toCandidates(JSON.stringify(FIXTURE))?.candidates[2]?.type).toBe("cafe");
  });

  it("falls back to other when no type is recognised", () => {
    const mystery = toCandidates(JSON.stringify(FIXTURE))?.candidates[3];
    expect(mystery?.type).toBe("other");
    expect(mystery?.cuisine).toBeNull();
  });

  it("reads an empty answer as zero results, not as a failure", () => {
    // Google omits `places` entirely rather than sending []. Reading that as a
    // malformed body would report every quiet street as a provider outage.
    expect(toCandidates("{}")).toEqual({ candidates: [], truncated: false });
  });

  it("sets truncated once Google's cap is reached", () => {
    const full = {
      places: Array.from({ length: PLACES_MAX_RESULTS }, (_, i) => ({
        id: `ChIJ${i}`,
        displayName: { text: `Place ${i}` },
        location: { latitude: 45.76, longitude: 4.83 },
        primaryType: "restaurant",
      })),
    };
    const mapped = toCandidates(JSON.stringify(full));
    expect(mapped?.candidates).toHaveLength(PLACES_MAX_RESULTS);
    expect(mapped?.truncated).toBe(true);
  });

  it("rejects an error payload and unparseable bodies", () => {
    expect(
      toCandidates(JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT" } })),
    ).toBeNull();
    expect(toCandidates("<html>quota</html>")).toBeNull();
  });

  it("skips a place with no id rather than losing the rest", () => {
    const mixed = { places: [{ displayName: { text: "Nameless id" } }, ...FIXTURE.places] };
    expect(toCandidates(JSON.stringify(mixed))?.candidates).toHaveLength(4);
  });
});

describe("POST /api/admin/import/places", () => {
  it("returns candidates and caches the raw body", async () => {
    stubPlaces(ok(FIXTURE));

    const response = await search();
    expect(response.status).toBe(200);

    const body = (await response.json()) as AreaSearchResponse;
    expect(body.cached).toBe(false);
    expect(body.truncated).toBe(false);
    expect(body.candidates).toHaveLength(4);

    const [cached] = await getDb(env.DB).select().from(overpassCache);
    if (!cached) throw new Error("the search cached nothing");
    expect(JSON.parse(cached.body)).toEqual(FIXTURE);
  });

  it("sends the key and the field mask as headers, and JSON as the body", async () => {
    stubPlaces(ok(FIXTURE));
    await search();

    const [sent] = fetchCalls;
    expect(sent?.url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    const headers = sent?.init?.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe(KEY);
    // Omitting the mask is a 400; widening it changes the SKU we are billed at.
    expect(headers["X-Goog-FieldMask"]).toBe(PLACES_FIELD_MASK);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("serves a second identical search from the cache, without paying again", async () => {
    stubPlaces(ok(FIXTURE));
    await search();
    expect(fetchCalls).toHaveLength(1);

    const second = (await (await search()).json()) as AreaSearchResponse;
    expect(second.cached).toBe(true);
    expect(second.candidates).toHaveLength(4);
    // With Overpass this was etiquette. Here it is the bill.
    expect(fetchCalls).toHaveLength(1);
  });

  it("asks again once the cached answer is older than the TTL", async () => {
    stubPlaces(ok(FIXTURE));
    await search();

    const db = getDb(env.DB);
    const [row] = await db.select().from(overpassCache);
    if (!row) throw new Error("the search cached nothing");
    await db
      .update(overpassCache)
      .set({ createdAt: Date.now() - PLACES_CACHE_TTL_MS - 1 })
      .where(eq(overpassCache.hash, row.hash));

    const again = (await (await search()).json()) as AreaSearchResponse;
    expect(again.cached).toBe(false);
    expect(fetchCalls).toHaveLength(2);
  });

  it("answers 503 without calling Google when no key is configured", async () => {
    stubPlaces(ok(FIXTURE));
    delete env.GOOGLE_PLACES_KEY;

    const response = await search();
    expect(response.status).toBe(503);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: "places_unconfigured",
    });
    // A deployment with no billing account must cost nothing and touch nothing.
    expect(fetchCalls).toHaveLength(0);
    expect(await getDb(env.DB).select().from(overpassCache)).toHaveLength(0);
  });

  it("answers 502, not 500, when Google rejects or fails", async () => {
    stubPlaces(() => new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 }));
    const response = await search();

    expect(response.status).toBe(502);
    // One request per click: a retry here is another billable call, so it stays
    // the admin's decision.
    expect(fetchCalls).toHaveLength(1);
    expect((await response.json()) as { error: string }).toMatchObject({ error: "places_failed" });
  });

  it("answers 502 when the network itself fails", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("connection reset")));
    expect((await search()).status).toBe(502);
  });

  it("answers 502 on a 200 that is not a Places answer, and caches nothing", async () => {
    stubPlaces(() => new Response("<html>quota exceeded</html>", { status: 200 }));
    expect((await search()).status).toBe(502);
    expect(await getDb(env.DB).select().from(overpassCache)).toHaveLength(0);
  });

  it("never echoes the key back, whatever Google said", async () => {
    // A 400 from a bad field mask repeats the request; the key is in its
    // headers. Nothing from Google's body reaches the admin.
    stubPlaces(() => new Response(JSON.stringify({ error: { message: KEY } }), { status: 400 }));
    const text = await (await search()).text();
    expect(text).not.toContain(KEY);
  });

  it("rejects a radius outside the drawable range", async () => {
    stubPlaces(ok(FIXTURE));
    expect((await search({ center: CENTER, radius: 50_000 })).status).toBe(400);
    expect((await search({ center: CENTER, radius: 1 })).status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it("is admin-only", async () => {
    stubPlaces(ok(FIXTURE));
    env.DEV_USER_EMAIL = AGENT;
    const response = await search();
    expect(response.status).toBe(403);
    expect(fetchCalls).toHaveLength(0);
  });
});

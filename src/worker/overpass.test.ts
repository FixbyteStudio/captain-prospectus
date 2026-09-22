import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { overpassCache } from "./db/schema";
import { OVERPASS_QUERY_VERSION, buildOverpassQuery, polygonHash, toCandidates } from "./overpass";
import { OVERPASS_CACHE_TTL_MS, OVERPASS_CANDIDATES_LIMIT } from "../shared/constants";
import type { AreaSearchResponse } from "../shared/schemas";

/**
 * The map import — ADR-0008, docs/domains/ingestion.md.
 *
 * Every test here runs against a **fixture**, never the live Overpass API
 * (.claude/skills/overpass-import). It is a donated public service, and a test
 * suite that hits it on every CI run is exactly the abuse its usage policy is
 * about. `fetch` is stubbed; a test that reaches the network fails loudly
 * because the stub counts its calls.
 */

const ADMIN = "admin@example.com";
const AGENT = "agent@example.com";
/** A small triangle over the Grand-Place. Three vertices is POLYGON_MIN_VERTICES. */
const POLYGON: [number, number][] = [
  [50.847, 4.351],
  [50.848, 4.354],
  [50.8455, 4.3535],
];

async function call(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function search(polygon: unknown = POLYGON): Promise<Response> {
  return call("/api/admin/import/overpass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ polygon }),
  });
}

/** A named node, an unnamed bar, a way with only a `center`, and a food truck. */
const FIXTURE = {
  elements: [
    {
      type: "node",
      id: 123,
      lat: 50.8479,
      lon: 4.3538,
      tags: {
        name: "Le Bouchon",
        amenity: "restaurant",
        cuisine: "french",
        phone: "+32 2 511 00 00",
        "addr:housenumber": "12",
        "addr:street": "rue des Bouchers",
        "addr:city": "Bruxelles",
      },
    },
    { type: "node", id: 456, lat: 50.8472, lon: 4.3529, tags: { amenity: "bar" } },
    {
      type: "way",
      id: 789,
      center: { lat: 50.8464, lon: 4.3541 },
      tags: { name: "Pizza Vera", amenity: "fast_food", "contact:website": "https://vera.be" },
    },
    {
      type: "node",
      id: 999,
      lat: 50.8468,
      lon: 4.3519,
      tags: { name: "Crêpes Momo", amenity: "fast_food", street_vendor: "yes" },
    },
  ],
};

let fetchCalls: { url: string; init: RequestInit | undefined }[] = [];

/** Stub `fetch` with a scripted reply. Returns nothing to the network. */
function stubOverpass(reply: () => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init });
    return Promise.resolve(reply());
  });
}

const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200 });

beforeEach(async () => {
  fetchCalls = [];
  await getDb(env.DB).delete(overpassCache);
});

afterEach(() => {
  vi.unstubAllGlobals();
  env.DEV_USER_EMAIL = ADMIN;
});

describe("buildOverpassQuery", () => {
  it("writes poly: as space-separated `lat lon` pairs, not lon lat", () => {
    const query = buildOverpassQuery(POLYGON);
    // Reversing these returns an empty set rather than an error, so it is
    // pinned explicitly.
    expect(query).toContain('(poly:"50.84700 4.35100 50.84800 4.35400 50.84550 4.35350")');
  });

  it("matches the query recorded in docs/domains/ingestion.md", () => {
    const query = buildOverpassQuery(POLYGON);
    expect(query.startsWith("[out:json][timeout:25];")).toBe(true);
    expect(query).toContain('nwr["amenity"~"^(restaurant|fast_food|cafe|bar|ice_cream)$"]');
    expect(query).toContain('nwr["street_vendor"]');
    // `out center;` is what gives a way or relation a coordinate at all.
    expect(query.trimEnd().endsWith("out center;")).toBe(true);
  });
});

describe("polygonHash", () => {
  it("is stable under jitter finer than 5 decimals, so a redrag still hits the cache", async () => {
    const nudged = POLYGON.map(([lat, lng]): [number, number] => [lat + 0.000001, lng - 0.000002]);
    expect(await polygonHash(nudged)).toBe(await polygonHash(POLYGON));
  });

  it("changes when the polygon moves more than that", async () => {
    const moved: [number, number][] = [[50.95, 4.3525], ...POLYGON.slice(1)];
    expect(await polygonHash(moved)).not.toBe(await polygonHash(POLYGON));
  });

  it("includes the query version, so a changed query cannot read a stale answer", async () => {
    // Guards the versioning mechanism itself: if the constant stops being part
    // of the input, bumping it would silently keep serving the old results.
    const hash = await polygonHash(POLYGON);
    expect(OVERPASS_QUERY_VERSION).toBeTruthy();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("toCandidates", () => {
  it("maps every field in the ingestion.md table", () => {
    const mapped = toCandidates(JSON.stringify(FIXTURE));
    const bouchon = mapped?.candidates[0];
    expect(bouchon).toEqual({
      name: "Le Bouchon",
      named: true,
      type: "restaurant",
      lat: 50.8479,
      lng: 4.3538,
      address: "12 rue des Bouchers, Bruxelles",
      phone: "+32 2 511 00 00",
      website: null,
      cuisine: "french",
      sourceRef: "node/123",
    });
  });

  it("keeps an unnamed element, flagged, rather than dropping it", () => {
    const bar = toCandidates(JSON.stringify(FIXTURE))?.candidates[1];
    expect(bar).toMatchObject({ name: "", named: false, type: "bar", sourceRef: "node/456" });
  });

  it("reads a way's coordinates from `center`", () => {
    const pizza = toCandidates(JSON.stringify(FIXTURE))?.candidates[2];
    expect(pizza).toMatchObject({ lat: 50.8464, lng: 4.3541, sourceRef: "way/789" });
    expect(pizza?.website).toBe("https://vera.be");
  });

  it("lets street_vendor win over amenity, so a crêpe van is a food truck", () => {
    const truck = toCandidates(JSON.stringify(FIXTURE))?.candidates[3];
    expect(truck?.type).toBe("food_truck");
  });

  it("skips an element with no type/id instead of failing the whole import", () => {
    const mapped = toCandidates(JSON.stringify({ elements: [{ tags: { name: "orphan" } }] }));
    expect(mapped).toEqual({ candidates: [], truncated: false });
  });

  it("returns null for a body that is not an Overpass answer", () => {
    // Overpass serves a rate-limit notice as HTML with a 200.
    expect(toCandidates("<html>Too many requests</html>")).toBeNull();
    expect(toCandidates(JSON.stringify({ remark: "runtime error" }))).toBeNull();
  });

  it("truncates past OVERPASS_CANDIDATES_LIMIT rather than spending the CPU", () => {
    const many = {
      elements: Array.from({ length: OVERPASS_CANDIDATES_LIMIT + 5 }, (_, i) => ({
        type: "node",
        id: i,
        lat: 45,
        lon: 4,
        tags: { name: `Place ${i}`, amenity: "cafe" },
      })),
    };
    const mapped = toCandidates(JSON.stringify(many));
    expect(mapped?.truncated).toBe(true);
    expect(mapped?.candidates).toHaveLength(OVERPASS_CANDIDATES_LIMIT);
  });
});

describe("POST /api/admin/import/overpass", () => {
  it("returns candidates and caches the raw body", async () => {
    stubOverpass(ok(FIXTURE));

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

  it("identifies the app to Overpass and posts a urlencoded query", async () => {
    stubOverpass(ok(FIXTURE));
    await search();

    const [sent] = fetchCalls;
    expect(sent?.url).toBe("https://overpass-api.de/api/interpreter");
    const headers = sent?.init?.headers as Record<string, string>;
    // Etiquette: an abusive client should be contactable, not just blockable.
    expect(headers["User-Agent"]).toContain("CaptainProspectus");
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(String(sent?.init?.body).startsWith("data=")).toBe(true);
  });

  it("serves a second identical search from the cache, without calling Overpass", async () => {
    stubOverpass(ok(FIXTURE));
    await search();
    expect(fetchCalls).toHaveLength(1);

    const second = (await (await search()).json()) as AreaSearchResponse;
    expect(second.cached).toBe(true);
    expect(second.candidates).toHaveLength(4);
    // The whole point of ADR-0008: redrawing must not be another request.
    expect(fetchCalls).toHaveLength(1);
  });

  it("asks again once the cached answer is older than the TTL", async () => {
    stubOverpass(ok(FIXTURE));
    await search();

    const db = getDb(env.DB);
    const [row] = await db.select().from(overpassCache);
    if (!row) throw new Error("the search cached nothing");
    await db
      .update(overpassCache)
      .set({ createdAt: Date.now() - OVERPASS_CACHE_TTL_MS - 1 })
      .where(eq(overpassCache.hash, row.hash));

    const again = (await (await search()).json()) as AreaSearchResponse;
    expect(again.cached).toBe(false);
    expect(fetchCalls).toHaveLength(2);
  });

  it("answers 502, not 500, when Overpass rate-limits or fails", async () => {
    stubOverpass(() => new Response("slow down", { status: 429 }));
    const response = await search();

    // A thrown error would become a 500 in index.ts's onError, contradicting
    // docs/api.md. And no retry loop: one request per click.
    expect(response.status).toBe(502);
    expect(fetchCalls).toHaveLength(1);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: "overpass_failed",
    });
  });

  it("answers 502 when the network itself fails", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("connection reset")));
    expect((await search()).status).toBe(502);
  });

  it("answers 502 when Overpass returns HTML with a 200", async () => {
    stubOverpass(() => new Response("<html>Too many requests</html>", { status: 200 }));
    expect((await search()).status).toBe(502);
    // Nothing unparseable is cached, or the next search would serve it.
    expect(await getDb(env.DB).select().from(overpassCache)).toHaveLength(0);
  });

  it("rejects a polygon with fewer than three vertices", async () => {
    stubOverpass(ok(FIXTURE));
    const response = await search([[50.8467, 4.3525]]);
    expect(response.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it("is admin-only", async () => {
    stubOverpass(ok(FIXTURE));
    env.DEV_USER_EMAIL = AGENT;
    const response = await search();
    expect(response.status).toBe(403);
    // The role check runs before the body is read, let alone Overpass called.
    expect(fetchCalls).toHaveLength(0);
  });
});

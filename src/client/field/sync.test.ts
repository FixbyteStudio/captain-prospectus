import { beforeEach, describe, expect, it } from "vitest";
import { CLIENT_VERSION, MAX_REQUEST_BYTES, SYNC_VISITS_PER_REQUEST } from "../../shared/constants";
import type { FieldProspect, Script, SyncRequest, SyncResponse, Visit } from "../../shared/schemas";
import { FieldDb, getMeta, setMeta } from "./db";
import { backoffDelayMs, runSync } from "./sync";

/**
 * INVARIANT 5: never lose a visit. Every test here is a way the outbox could be
 * cleared when it must not be. CONTRIBUTING.md: sync has tests before merge.
 */

let db: FieldDb;
let dbCounter = 0;

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: crypto.randomUUID(),
  prospectId: crypto.randomUUID(),
  visitedAt: 1_700_000_000_000,
  lat: null,
  lng: null,
  flyerGiven: true,
  outcome: "interested",
  followUpAt: null,
  notes: null,
  scriptId: null,
  answers: {},
  ...over,
});

const okResponse = (over: Partial<SyncResponse> = {}): SyncResponse => ({
  serverTime: 1_700_000_100_000,
  accepted: { prospects: [], visits: [] },
  idMap: {},
  prospects: [],
  script: null,
  ...over,
});

const respondWith = (body: SyncResponse, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const failWith = (status: number) =>
  (async () => new Response("{}", { status })) as unknown as typeof fetch;

beforeEach(async () => {
  db = new FieldDb(`test-${dbCounter++}`);
  await db.open();
});

describe("runSync — what clears the outbox", () => {
  it("deletes only the ids the server listed in accepted", async () => {
    const kept = visit();
    const accepted = visit();
    await db.outboxVisits.bulkAdd([kept, accepted]);

    const result = await runSync({
      db,
      fetchFn: respondWith(okResponse({ accepted: { prospects: [], visits: [accepted.id] } })),
    });

    expect(result.status).toBe("ok");
    const remaining = await db.outboxVisits.toArray();
    expect(remaining.map((v) => v.id)).toEqual([kept.id]);
  });

  it("keeps everything when the response omits accepted ids entirely", async () => {
    await db.outboxVisits.add(visit());
    await runSync({ db, fetchFn: respondWith(okResponse()) });
    expect(await db.outboxVisits.count()).toBe(1);
  });
});

/**
 * The script travels on every sync and is cached for the visit form to pin.
 * Nothing asserted this before: `okResponse()` set `script: null` everywhere.
 */
describe("runSync — the cached script", () => {
  const script: Script = {
    id: 7,
    name: "Questionnaire",
    version: 3,
    isActive: true,
    createdAt: 1_700_000_000_000,
    questions: [{ key: "has_delivery", label: "Livraison ?", type: "yes_no", required: true }],
  };

  it("writes the active script into meta", async () => {
    await runSync({ db, fetchFn: respondWith(okResponse({ script })) });

    expect(await getMeta(db, "script")).toEqual(script);
  });

  it("clears it when the server reports none, rather than keeping a stale one", async () => {
    await setMeta(db, "script", script);
    await runSync({ db, fetchFn: respondWith(okResponse({ script: null })) });

    expect(await getMeta(db, "script")).toBeNull();
  });

  it("leaves the cached script alone when the sync failed", async () => {
    await setMeta(db, "script", script);
    await runSync({ db, fetchFn: failWith(500) });

    expect(await getMeta(db, "script")).toEqual(script);
  });
});

describe("runSync — failures must never clear the outbox", () => {
  it.each([
    ["an expired Access session (401)", 401],
    ["a wrong role (403)", 403],
    ["a build too old (426)", 426],
    ["a server error (500)", 500],
    ["a D1 quota error (503)", 503],
    ["a payload too large (413)", 413],
  ])("keeps the outbox on %s", async (_label, status) => {
    await db.outboxVisits.add(visit());
    const result = await runSync({ db, fetchFn: failWith(status) });

    expect(result.status).not.toBe("ok");
    expect(await db.outboxVisits.count()).toBe(1);
    expect(result.remaining).toBe(1);
  });

  it("reports 426 as an upgrade, distinctly from an auth failure", async () => {
    await db.outboxVisits.add(visit());
    expect((await runSync({ db, fetchFn: failWith(426) })).status).toBe("upgrade");
    expect((await runSync({ db, fetchFn: failWith(401) })).status).toBe("auth");
  });

  it("keeps the outbox when the network is gone", async () => {
    await db.outboxVisits.add(visit());
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const result = await runSync({ db, fetchFn: offline });
    expect(result.status).toBe("offline");
    expect(await db.outboxVisits.count()).toBe(1);
  });

  it("treats an Access login redirect as an auth failure, not as success", async () => {
    await db.outboxVisits.add(visit());
    const redirected = (async () => {
      // A real opaqueredirect response reports status 0, but the Response
      // constructor rejects that value, so only `type` can be faked here.
      const r = new Response(null, { status: 200 });
      Object.defineProperty(r, "type", { value: "opaqueredirect" });
      return r;
    }) as unknown as typeof fetch;

    const result = await runSync({ db, fetchFn: redirected });
    expect(result.status).toBe("auth");
    expect(await db.outboxVisits.count()).toBe(1);
  });

  it("keeps the outbox when the response does not match the contract", async () => {
    await db.outboxVisits.add(visit());
    const garbage = (async () =>
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
      })) as unknown as typeof fetch;

    const result = await runSync({ db, fetchFn: garbage });
    expect(result.status).toBe("error");
    expect(await db.outboxVisits.count()).toBe(1);
  });
});

describe("runSync — dedupe collisions", () => {
  it("rewrites prospectId on outbox visits before deleting anything", async () => {
    const clientProspectId = crypto.randomUUID();
    const serverProspectId = crypto.randomUUID();
    const pending = visit({ prospectId: clientProspectId });
    await db.outboxVisits.add(pending);

    await runSync({
      db,
      fetchFn: respondWith(
        okResponse({
          idMap: { [clientProspectId]: serverProspectId },
          accepted: { prospects: [clientProspectId], visits: [] },
        }),
      ),
    });

    const [remaining] = await db.outboxVisits.toArray();
    expect(remaining?.prospectId).toBe(serverProspectId);
  });
});

describe("runSync — the pull", () => {
  it("replaces the today list rather than merging into it", async () => {
    await db.prospects.add({
      id: crypto.randomUUID(),
      name: "Ancien",
      type: "restaurant",
      lat: null,
      lng: null,
      address: null,
      phone: null,
      website: null,
      cuisine: null,
      source: "csv",
      status: "assigned",
      assignedTo: "agent@example.com",
      lastVisitAt: null,
      nextVisitAt: null,
    });

    await runSync({
      db,
      fetchFn: respondWith(
        okResponse({
          prospects: [
            {
              id: crypto.randomUUID(),
              name: "Nouveau",
              type: "cafe",
              lat: null,
              lng: null,
              address: null,
              phone: null,
              website: null,
              cuisine: null,
              source: "csv",
              status: "assigned",
              assignedTo: "agent@example.com",
              lastVisitAt: null,
              nextVisitAt: null,
            },
          ],
        }),
      ),
    });

    const list = await db.prospects.toArray();
    expect(list.map((p) => p.name)).toEqual(["Nouveau"]);
  });

  it("sends the current contract version", async () => {
    let sent: unknown;
    const capture = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify(okResponse()), { status: 200 });
    }) as unknown as typeof fetch;

    await runSync({ db, fetchFn: capture });
    expect((sent as { clientVersion: number }).clientVersion).toBe(CLIENT_VERSION);
  });
});

describe("backoffDelayMs", () => {
  it("grows exponentially and stops at five minutes", () => {
    expect(backoffDelayMs(0)).toBe(0);
    expect(backoffDelayMs(1)).toBe(5_000);
    expect(backoffDelayMs(2)).toBe(10_000);
    expect(backoffDelayMs(3)).toBe(20_000);
    expect(backoffDelayMs(50)).toBe(300_000);
  });
});

/**
 * The byte cap (MAX_REQUEST_BYTES) is enforced by the Worker, which answers 413
 * — and a 413 keeps the outbox, so a payload that is always too large is an
 * outbox that never drains. The client's job is never to build one.
 */
describe("runSync — staying under MAX_REQUEST_BYTES", () => {
  /** A visit with 50 answers of 2000 characters: ~100 kB, and schema-valid. */
  const hugeVisit = () =>
    visit({
      notes: "n".repeat(2000),
      answers: Object.fromEntries(
        Array.from({ length: 50 }, (_, q) => [`question_${q}`, "a".repeat(2000)]),
      ),
    });

  const captureBody = () => {
    const sent: string[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      sent.push(init.body as string);
      return new Response(JSON.stringify(okResponse()), { status: 200 });
    }) as unknown as typeof fetch;
    /** The one request runSync made. Fails loudly rather than yielding undefined. */
    const only = (): string => {
      expect(sent).toHaveLength(1);
      const [body] = sent;
      if (body === undefined) throw new Error("runSync sent no request");
      return body;
    };
    return { only, fetchFn };
  };

  it("trims a batch that would exceed the cap, and sends every field prospect", async () => {
    const prospect: FieldProspect = {
      id: crypto.randomUUID(),
      name: "Le Bistrot",
      type: "restaurant",
      lat: null,
      lng: null,
      address: null,
      phone: null,
      createdAt: 1_700_000_000_000,
    };
    await db.outboxProspects.add(prospect);
    for (let i = 0; i < SYNC_VISITS_PER_REQUEST; i++) await db.outboxVisits.add(hugeVisit());

    const { only, fetchFn } = captureBody();
    await runSync({ db, fetchFn });

    const body = only();
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(MAX_REQUEST_BYTES);

    const parsed = JSON.parse(body) as SyncRequest;
    expect(parsed.visits.length).toBeLessThan(SYNC_VISITS_PER_REQUEST);
    expect(parsed.visits.length).toBeGreaterThan(0);
    // A visit may reference a prospect created in the same payload, so prospects
    // are never what gets dropped.
    expect(parsed.prospects).toHaveLength(1);
  });

  it("still sends a single visit that is near the cap on its own", async () => {
    await db.outboxVisits.add(hugeVisit());

    const { only, fetchFn } = captureBody();
    await runSync({ db, fetchFn });

    expect((JSON.parse(only()) as SyncRequest).visits).toHaveLength(1);
  });

  it("does not trim, or re-serialize, an ordinary batch", async () => {
    for (let i = 0; i < 20; i++) await db.outboxVisits.add(visit());

    const { only, fetchFn } = captureBody();
    await runSync({ db, fetchFn });

    expect((JSON.parse(only()) as SyncRequest).visits).toHaveLength(20);
  });
});

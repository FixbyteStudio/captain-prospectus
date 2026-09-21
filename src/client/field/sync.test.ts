import { beforeEach, describe, expect, it } from "vitest";
import { CLIENT_VERSION } from "../../shared/constants";
import type { SyncResponse, Visit } from "../../shared/schemas";
import { FieldDb } from "./db";
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

describe("runSync — failures must never clear the outbox", () => {
  it.each([
    ["an expired Access session (401)", 401],
    ["a wrong role (403)", 403],
    ["a build too old (426)", 426],
    ["a server error (500)", 500],
    ["a D1 quota error (503)", 503],
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

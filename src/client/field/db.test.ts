import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import type { Visit } from "../../shared/schemas";
import { cacheVisitHistory, clearAgentCache, FieldDb, getMeta, outboxCounts, setMeta } from "./db";

/**
 * INVARIANT 5 again, from the storage end. A schema upgrade is the one moment
 * the outbox could be silently emptied, and `db.ts` says so at the top: this is
 * a cache plus an outbox, and the outbox is the only copy of a visit until the
 * server accepts it.
 */

let counter = 0;
const dbName = () => `upgrade-test-${counter++}`;

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

const entry = (prospectId: string, over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  prospectId,
  agentEmail: "agent@example.com",
  visitedAt: 1_700_000_000_000,
  flyerGiven: true,
  outcome: "interested" as const,
  followUpAt: null,
  notes: null,
  ...over,
});

describe("the v1 → v2 upgrade", () => {
  it("carries the outbox across untouched", async () => {
    const name = dbName();

    // A phone on the old build, holding visits it has not synced.
    const v1 = new Dexie(name);
    v1.version(1).stores({
      prospects: "id, status, assignedTo",
      outboxProspects: "id",
      outboxVisits: "id, prospectId",
      meta: "key",
    });
    await v1.open();
    const pending = [visit(), visit(), visit()];
    await v1.table("outboxVisits").bulkPut(pending);
    v1.close();

    // The new build opens the same database.
    const v2 = new FieldDb(name);
    await v2.open();

    const kept = await v2.outboxVisits.toArray();
    expect(kept).toHaveLength(3);
    expect(kept.map((v) => v.id).sort()).toEqual(pending.map((v) => v.id).sort());
    v2.close();
  });

  it("adds the history table without it existing before", async () => {
    const name = dbName();
    const db = new FieldDb(name);
    await db.open();

    expect(db.verno).toBe(3);
    await expect(db.visitHistory.count()).resolves.toBe(0);
    db.close();
  });
});

describe("the v2 → v3 upgrade", () => {
  const openV2 = async (name: string) => {
    const v2 = new Dexie(name);
    v2.version(1).stores({
      prospects: "id, status, assignedTo",
      outboxProspects: "id",
      outboxVisits: "id, prospectId",
      meta: "key",
    });
    v2.version(2).stores({ visitHistory: "id, prospectId" });
    await v2.open();
    return v2;
  };

  it("carries the outbox across, stamped with the cached identity", async () => {
    const name = dbName();
    const v2 = await openV2(name);
    const pending = [visit(), visit(), visit()];
    await v2.table("outboxVisits").bulkPut(pending);
    await v2.table("outboxProspects").put({
      id: crypto.randomUUID(),
      name: "Le camion",
      type: "food_truck",
      lat: null,
      lng: null,
      address: null,
      phone: null,
      createdAt: 1_700_000_000_000,
    });
    await v2
      .table("meta")
      .put({ key: "identity", value: { email: "a@example.com", role: "agent" } });
    v2.close();

    const v3 = new FieldDb(name);
    await v3.open();

    const kept = await v3.outboxVisits.toArray();
    expect(kept.map((v) => v.id).sort()).toEqual(pending.map((v) => v.id).sort());
    expect(kept.every((v) => v.writtenBy === "a@example.com")).toBe(true);
    const { writtenBy, ...wire } = kept.find((v) => v.id === pending[0]?.id) ?? {};
    expect(writtenBy).toBe("a@example.com");
    expect(wire).toEqual(pending[0]);
    const prospects = await v3.outboxProspects.toArray();
    expect(prospects.map((p) => p.writtenBy)).toEqual(["a@example.com"]);
    v3.close();
  });

  it("leaves rows unstamped, never dropped, when no identity is cached", async () => {
    const name = dbName();
    const v2 = await openV2(name);
    const pending = [visit(), visit()];
    await v2.table("outboxVisits").bulkPut(pending);
    v2.close();

    const v3 = new FieldDb(name);
    await v3.open();

    const kept = await v3.outboxVisits.toArray();
    expect(kept).toHaveLength(2);
    expect(kept.every((v) => v.writtenBy === undefined)).toBe(true);
    v3.close();
  });
});

describe("outboxCounts", () => {
  it("splits the outbox between this identity's rows and another's", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    await db.outboxVisits.bulkPut([
      { ...visit(), writtenBy: "a@example.com" },
      { ...visit(), writtenBy: "b@example.com" },
      visit(),
    ]);

    // The unstamped row counts as whoever is signed in: it would be sent.
    await expect(outboxCounts(db, "b@example.com")).resolves.toEqual({ pending: 2, heldBack: 1 });
    db.close();
  });
});

describe("cacheVisitHistory", () => {
  it("replaces what it holds for one prospect", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    const prospectId = crypto.randomUUID();

    await cacheVisitHistory(db, prospectId, [entry(prospectId), entry(prospectId)]);
    await cacheVisitHistory(db, prospectId, [entry(prospectId)]);

    await expect(db.visitHistory.where("prospectId").equals(prospectId).count()).resolves.toBe(1);
    db.close();
  });

  it("leaves another prospect's cache alone", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();

    await cacheVisitHistory(db, a, [entry(a), entry(a)]);
    await cacheVisitHistory(db, b, [entry(b)]);

    // An agent who goes offline mid-round keeps the history they already pulled.
    await expect(db.visitHistory.where("prospectId").equals(a).count()).resolves.toBe(2);
    db.close();
  });

  it("clears a prospect's cache when the server reports no visits", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    const prospectId = crypto.randomUUID();

    await cacheVisitHistory(db, prospectId, [entry(prospectId)]);
    await cacheVisitHistory(db, prospectId, []);

    await expect(db.visitHistory.where("prospectId").equals(prospectId).count()).resolves.toBe(0);
    db.close();
  });
});

describe("clearAgentCache", () => {
  it("drops the round, the history and the identity", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    const prospectId = crypto.randomUUID();

    await db.prospects.put({
      id: prospectId,
      name: "Chez Paul",
      type: "restaurant",
      status: "assigned",
      address: null,
      phone: null,
      website: null,
      cuisine: null,
      source: "osm",
      assignedTo: "a@example.com",
      lat: null,
      lng: null,
      lastVisitAt: null,
      nextVisitAt: null,
    });
    await cacheVisitHistory(db, prospectId, [entry(prospectId)]);
    await setMeta(db, "identity", { email: "a@example.com", role: "agent" });

    await clearAgentCache(db);

    await expect(db.prospects.count()).resolves.toBe(0);
    await expect(db.visitHistory.count()).resolves.toBe(0);
    await expect(getMeta(db, "identity")).resolves.toBeUndefined();
    db.close();
  });

  it("leaves the outbox alone — INVARIANT 5", async () => {
    const db = new FieldDb(dbName());
    await db.open();

    // A revoked session is not the server listing these in `accepted`, which
    // is the only thing allowed to delete them.
    await db.outboxVisits.bulkPut([visit(), visit()]);
    await db.outboxProspects.put({
      id: crypto.randomUUID(),
      name: "Le camion",
      type: "food_truck",
      lat: null,
      lng: null,
      address: null,
      phone: null,
      createdAt: 1_700_000_000_000,
    });

    await clearAgentCache(db);

    await expect(db.outboxVisits.count()).resolves.toBe(2);
    await expect(db.outboxProspects.count()).resolves.toBe(1);
    db.close();
  });

  it("keeps the last sync time, which belongs to the device, not the agent", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    await setMeta(db, "lastSyncAt", 1_700_000_000_000);

    await clearAgentCache(db);

    await expect(getMeta(db, "lastSyncAt")).resolves.toBe(1_700_000_000_000);
    db.close();
  });
});

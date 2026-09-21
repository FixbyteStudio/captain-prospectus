import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import type { Visit } from "../../shared/schemas";
import { cacheVisitHistory, FieldDb } from "./db";

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

    expect(db.verno).toBe(2);
    await expect(db.visitHistory.count()).resolves.toBe(0);
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

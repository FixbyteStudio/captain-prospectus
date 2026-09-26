import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import type { Visit } from "../../shared/schemas";
import { brusselsPeriod } from "../../shared/period";
import {
  cacheVisitHistory,
  clearAgentCache,
  FieldDb,
  getMeta,
  outboxCounts,
  queueVisit,
  setMeta,
  todaysSentVisits,
} from "./db";

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

  it("reaches v4 with the history and log tables present but empty", async () => {
    const name = dbName();
    const db = new FieldDb(name);
    await db.open();

    expect(db.verno).toBe(4);
    await expect(db.visitHistory.count()).resolves.toBe(0);
    await expect(db.sentVisits.count()).resolves.toBe(0);
    db.close();
  });
});

/**
 * A hand-copied snapshot of the schema a phone stopped on before v3 shipped
 * (docs/backlog/005), not an import from `db.ts`: importing `FieldDb` here
 * would test v4's upgrade against whatever earlier versions happen to look
 * like today, not the shape that is actually sitting on a device in the
 * field.
 */
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

/**
 * Same reasoning as `openV2`, one version further: a hand-copied snapshot of
 * the real v3 upgrade (the `writtenBy` stamp, docs/backlog/005) rather than
 * an import, so this test proves v4 against v3 as it is, not as `db.ts`
 * might drift to. Verified to match `db.ts`'s own `version(3)` as it stands.
 */
const openV3 = async (name: string) => {
  const v3 = new Dexie(name);
  v3.version(1).stores({
    prospects: "id, status, assignedTo",
    outboxProspects: "id",
    outboxVisits: "id, prospectId",
    meta: "key",
  });
  v3.version(2).stores({ visitHistory: "id, prospectId" });
  v3.version(3)
    .stores({})
    .upgrade(async (tx) => {
      const row = (await tx.table("meta").get("identity")) as
        { value?: { email?: unknown } } | undefined;
      const email = row?.value?.email;
      if (typeof email !== "string") return;
      const stamp = (item: { writtenBy?: string }) => {
        item.writtenBy ??= email;
      };
      await tx.table("outboxVisits").toCollection().modify(stamp);
      await tx.table("outboxProspects").toCollection().modify(stamp);
    });
  await v3.open();
  return v3;
};

describe("the v2 → v4 upgrade", () => {
  it("carries the outbox across, stamped with the cached identity, and opens sentVisits empty", async () => {
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

    const v4 = new FieldDb(name);
    await v4.open();

    expect(v4.verno).toBe(4);
    const kept = await v4.outboxVisits.toArray();
    expect(kept.map((v) => v.id).sort()).toEqual(pending.map((v) => v.id).sort());
    expect(kept.every((v) => v.writtenBy === "a@example.com")).toBe(true);
    const { writtenBy, ...wire } = kept.find((v) => v.id === pending[0]?.id) ?? {};
    expect(writtenBy).toBe("a@example.com");
    expect(wire).toEqual(pending[0]);
    const prospects = await v4.outboxProspects.toArray();
    expect(prospects.map((p) => p.writtenBy)).toEqual(["a@example.com"]);
    await expect(v4.sentVisits.count()).resolves.toBe(0);
    v4.close();
  });

  it("leaves rows unstamped, never dropped, when no identity is cached", async () => {
    const name = dbName();
    const v2 = await openV2(name);
    const pending = [visit(), visit()];
    await v2.table("outboxVisits").bulkPut(pending);
    v2.close();

    const v4 = new FieldDb(name);
    await v4.open();

    const kept = await v4.outboxVisits.toArray();
    expect(kept).toHaveLength(2);
    expect(kept.every((v) => v.writtenBy === undefined)).toBe(true);
    await expect(v4.sentVisits.count()).resolves.toBe(0);
    v4.close();
  });
});

describe("the v3 → v4 upgrade", () => {
  it("carries stamped outbox rows and their stamps across, and opens sentVisits empty", async () => {
    const name = dbName();
    const v3 = await openV3(name);
    const pending = [visit(), visit()].map((v) => ({ ...v, writtenBy: "a@example.com" }));
    await v3.table("outboxVisits").bulkPut(pending);
    v3.close();

    const v4 = new FieldDb(name);
    await v4.open();

    expect(v4.verno).toBe(4);
    const kept = await v4.outboxVisits.toArray();
    expect(kept.map((v) => v.id).sort()).toEqual(pending.map((v) => v.id).sort());
    expect(kept.every((v) => v.writtenBy === "a@example.com")).toBe(true);
    await expect(v4.sentVisits.count()).resolves.toBe(0);
    v4.close();
  });
});

describe("queueVisit", () => {
  it("writes both rows in one transaction and stamps both with the identity", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    const v = visit();

    await queueVisit(db, v, "a@example.com");

    const [outboxRow] = await db.outboxVisits.toArray();
    const [logRow] = await db.sentVisits.toArray();
    expect(outboxRow).toMatchObject({ id: v.id, writtenBy: "a@example.com" });
    expect(logRow).toEqual({
      id: v.id,
      prospectId: v.prospectId,
      sentAt: expect.any(Number),
      writtenBy: "a@example.com",
    });
    db.close();
  });

  it("logs nothing when the outbox write fails — a visit lost to bookkeeping is INVARIANT 5", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    const v = visit();
    // Occupy the id first, so `outboxVisits.add` inside the transaction rejects
    // (Dexie's ConstraintError on a duplicate primary key) and the whole `rw`
    // transaction — including the log `put` — rolls back.
    await db.outboxVisits.add({ ...v, writtenBy: "a@example.com" });

    await expect(queueVisit(db, v, "a@example.com")).rejects.toBeDefined();

    await expect(db.sentVisits.count()).resolves.toBe(0);
    db.close();
  });

  it("does not lose the queued visit when the prune fails — INVARIANT 5", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    const v = visit();

    // The prune runs after the transaction commits (db.ts's comment on why).
    // Faking its one `.where(...)` call to reject proves that failure never
    // reaches the caller and never touches what was already written.
    const whereSpy = vi.spyOn(db.sentVisits, "where").mockReturnValueOnce({
      below: () => ({ delete: () => Promise.reject(new Error("boom")) }),
    } as unknown as ReturnType<typeof db.sentVisits.where>);

    await expect(queueVisit(db, v, "a@example.com")).resolves.toBeUndefined();
    // Let the fire-and-forget prune's rejection settle before asserting, so a
    // late unhandled rejection cannot leak into the next test either.
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(db.outboxVisits.get(v.id)).resolves.toMatchObject({ id: v.id });
    whereSpy.mockRestore();
    db.close();
  });

  it("prunes yesterday's log rows on the next queued visit", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    const now = 1_700_000_000_000;
    const { from } = brusselsPeriod(now, 1);
    const stale = { id: crypto.randomUUID(), prospectId: crypto.randomUUID() };
    await db.sentVisits.put({ ...stale, sentAt: from - 1, writtenBy: "a@example.com" });

    const v = visit({ visitedAt: now });
    await queueVisit(db, v, "a@example.com");
    // The prune is fire-and-forget after the transaction commits (db.ts's
    // comment on why); give it a tick before asserting it ran.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const ids = (await db.sentVisits.toArray()).map((row) => row.id);
    expect(ids).not.toContain(stale.id);
    expect(ids).toContain(v.id);
    db.close();
  });

  // Not behavioural coverage — VisitScreen is lazy, Dexie-backed and
  // form-heavy, so mounting it to prove one call site would be slow and
  // brittle (leave-guard.test.tsx's idiom). This is a reminder that the call
  // site still writes through `queueVisit`, so reverting it to a bare
  // `outboxVisits.add` — which would leave the whole suite green while the
  // feature ships inert — is noticed.
  it("is still the write VisitScreen makes when it saves a visit", () => {
    const source = readFileSync(new URL("./VisitScreen.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/queueVisit\(\s*fieldDb\s*,\s*result\.visit\s*,\s*identity\s*\)/);
  });
});

describe("todaysSentVisits", () => {
  it("reads nothing back the next morning, before the prune has run", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    const yesterday = 1_700_000_000_000;
    await db.sentVisits.put({
      id: crypto.randomUUID(),
      prospectId: crypto.randomUUID(),
      sentAt: yesterday,
      writtenBy: "a@example.com",
    });

    // Safely the next Brussels calendar day regardless of DST (at most a 1 h
    // shift): the read must exclude yesterday's row on its own, since the
    // prune only runs from `queueVisit` and nothing has queued anything yet.
    const nextMorning = yesterday + 26 * 60 * 60 * 1000;
    await expect(todaysSentVisits(db, nextMorning)).resolves.toEqual([]);
    db.close();
  });

  it("excludes a row stamped ahead of the device's clock", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    const now = 1_700_000_000_000;
    const { to } = brusselsPeriod(now, 1);
    await db.sentVisits.put({
      id: crypto.randomUUID(),
      prospectId: crypto.randomUUID(),
      sentAt: to, // tomorrow's Brussels midnight — outside today's window
      writtenBy: "a@example.com",
    });

    await expect(todaysSentVisits(db, now)).resolves.toEqual([]);
    db.close();
  });

  it("still counts a row logged 00:30 CEST on the day the clocks fall back", async () => {
    const db = new FieldDb(dbName());
    await db.open();
    // 2026-10-25 is Europe/Brussels' fall-back Sunday: CEST (UTC+2) until
    // 03:00 local (01:00 UTC), then CET (UTC+1). A visit queued at 00:30
    // CEST, before the change, must still be "today" for a read made later
    // that same day, after it — the boundary is a calendar date, not
    // `now − 24 h`.
    const sentAt = Date.UTC(2026, 9, 24, 22, 30, 0); // 2026-10-25 00:30 CEST
    const now = Date.UTC(2026, 9, 25, 13, 0, 0); // 2026-10-25 14:00 CET
    await db.sentVisits.put({
      id: crypto.randomUUID(),
      prospectId: crypto.randomUUID(),
      sentAt,
      writtenBy: "a@example.com",
    });

    await expect(todaysSentVisits(db, now)).resolves.toHaveLength(1);
    db.close();
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
    await db.sentVisits.put({
      id: crypto.randomUUID(),
      prospectId,
      sentAt: 1_700_000_000_000,
      writtenBy: "a@example.com",
    });

    await clearAgentCache(db);

    await expect(db.prospects.count()).resolves.toBe(0);
    await expect(db.visitHistory.count()).resolves.toBe(0);
    await expect(getMeta(db, "identity")).resolves.toBeUndefined();
    // Read-only knowledge for rendering, not a queued write (GH #119): leaving
    // it would carry the previous agent's visit ids and email on a shared phone.
    await expect(db.sentVisits.count()).resolves.toBe(0);
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

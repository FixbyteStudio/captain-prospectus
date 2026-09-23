import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { boundParamsPerRow, getDb } from "./db/client";
import { chunk } from "../shared/chunk";
import { prospects, scripts, visits, visitsOrphaned } from "./db/schema";
import { RETENTION_BATCH, RETENTION_MS } from "../shared/constants";
import { describeSweep, runRetention } from "./retention";
import worker from "./index";

/**
 * The retention sweep — ADR-0023.
 *
 * This is the only thing in the app that writes to `visits`, so the tests are
 * as much about what it must NOT touch as about what it clears.
 */

const AGENT = "agent@example.com";
const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);

async function seedProspect(id: string): Promise<void> {
  const db = getDb(env.DB);
  await db.insert(prospects).values({
    id,
    name: "Le Bistrot",
    type: "restaurant",
    lat: 50.85,
    lng: 4.35,
    address: null,
    phone: null,
    website: null,
    cuisine: null,
    source: "csv",
    sourceRef: null,
    dedupeKey: `test:${id}`,
    status: "assigned",
    assignedTo: AGENT,
    createdBy: AGENT,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function seedVisit(
  prospectId: string,
  over: { receivedAt?: number; lat?: number | null; notes?: string | null } = {},
): Promise<string> {
  const db = getDb(env.DB);
  const id = crypto.randomUUID();
  await db.insert(visits).values({
    id,
    prospectId,
    agentEmail: AGENT,
    visitedAt: over.receivedAt ?? NOW,
    clientVisitedAt: over.receivedAt ?? NOW,
    receivedAt: over.receivedAt ?? NOW,
    lat: over.lat === undefined ? 50.85 : over.lat,
    lng: over.lat === undefined ? 4.35 : null,
    flyerGiven: true,
    outcome: "converted",
    followUpAt: NOW + 1000,
    notes: over.notes === undefined ? "patron absent" : over.notes,
    scriptId: null,
    answers: { q1: true },
    clientVersion: 1,
  });
  return id;
}

/** Comfortably past the window. */
const OLD = NOW - RETENTION_MS - 24 * 60 * 60 * 1000;
/** Just inside it. */
const RECENT = NOW - RETENTION_MS + 24 * 60 * 60 * 1000;

beforeEach(async () => {
  const db = getDb(env.DB);
  await db.delete(visits);
  await db.delete(visitsOrphaned);
  await db.delete(prospects);
  await db.delete(scripts);
});

describe("runRetention", () => {
  it("nulls position and notes on an expired visit", async () => {
    const db = getDb(env.DB);
    const p = crypto.randomUUID();
    await seedProspect(p);
    const id = await seedVisit(p, { receivedAt: OLD });

    const result = await runRetention(db, NOW);
    expect(result.redacted).toBe(1);

    const [row] = await db.select().from(visits).where(eq(visits.id, id));
    expect(row?.lat).toBeNull();
    expect(row?.lng).toBeNull();
    expect(row?.notes).toBeNull();
  });

  it("keeps everything that is business history, not personal data", async () => {
    const db = getDb(env.DB);
    const p = crypto.randomUUID();
    await seedProspect(p);
    const id = await seedVisit(p, { receivedAt: OLD });

    await runRetention(db, NOW);

    const [row] = await db.select().from(visits).where(eq(visits.id, id));
    // The visit itself survives for ever: this is not a delete.
    expect(row).toBeDefined();
    expect(row?.outcome).toBe("converted");
    expect(row?.agentEmail).toBe(AGENT);
    expect(row?.visitedAt).toBe(OLD);
    expect(row?.flyerGiven).toBe(true);
    expect(row?.followUpAt).toBe(NOW + 1000);
    expect(row?.answers).toEqual({ q1: true });
    expect(row?.clientVersion).toBe(1);
  });

  it("leaves a visit inside the window alone", async () => {
    const db = getDb(env.DB);
    const p = crypto.randomUUID();
    await seedProspect(p);
    const id = await seedVisit(p, { receivedAt: RECENT });

    expect((await runRetention(db, NOW)).redacted).toBe(0);

    const [row] = await db.select().from(visits).where(eq(visits.id, id));
    expect(row?.lat).not.toBeNull();
    expect(row?.notes).toBe("patron absent");
  });

  /**
   * INVARIANT 12: a phone's clock can be wrong. Retention read against
   * visited_at could redact a visit the day it arrives, or never redact one.
   */
  it("measures against received_at, not visited_at", async () => {
    const db = getDb(env.DB);
    const p = crypto.randomUUID();
    await seedProspect(p);
    const id = await seedVisit(p, { receivedAt: RECENT });
    // A phone claiming the visit happened years ago must not age it out.
    await db.update(visits).set({ visitedAt: OLD, clientVisitedAt: OLD }).where(eq(visits.id, id));

    expect((await runRetention(db, NOW)).redacted).toBe(0);
    const [row] = await db.select().from(visits).where(eq(visits.id, id));
    expect(row?.notes).toBe("patron absent");
  });

  it("is idempotent: a second run the same day redacts nothing", async () => {
    const db = getDb(env.DB);
    const p = crypto.randomUUID();
    await seedProspect(p);
    await seedVisit(p, { receivedAt: OLD });

    expect((await runRetention(db, NOW)).redacted).toBe(1);
    // Already-redacted rows must stop matching, or the sweep rewrites the same
    // batch every day and never reaches the backlog behind it.
    expect((await runRetention(db, NOW)).redacted).toBe(0);
  });

  it("redacts a row that has only notes left, and one that has only a position", async () => {
    const db = getDb(env.DB);
    const p = crypto.randomUUID();
    await seedProspect(p);
    const notesOnly = await seedVisit(p, { receivedAt: OLD, lat: null });
    const posOnly = await seedVisit(p, { receivedAt: OLD, notes: null });

    expect((await runRetention(db, NOW)).redacted).toBe(2);

    const [a] = await db.select().from(visits).where(eq(visits.id, notesOnly));
    const [b] = await db.select().from(visits).where(eq(visits.id, posOnly));
    expect(a?.notes).toBeNull();
    expect(b?.lat).toBeNull();
  });

  it("bounds one run, and drains the backlog over later runs", async () => {
    const db = getDb(env.DB);
    const p = crypto.randomUUID();
    await seedProspect(p);

    const rows = Array.from({ length: RETENTION_BATCH + 10 }, () => ({
      id: crypto.randomUUID(),
      prospectId: p,
      agentEmail: AGENT,
      visitedAt: OLD,
      clientVisitedAt: OLD,
      receivedAt: OLD,
      lat: 50.85,
      lng: 4.35,
      flyerGiven: false,
      outcome: "interested" as const,
      followUpAt: null,
      notes: "x",
      scriptId: null,
      answers: {},
      clientVersion: 1,
    }));
    for (const batch of chunk(rows, boundParamsPerRow(visits))) {
      await db.insert(visits).values(batch);
    }

    // Bounded: one run does a batch, not the whole backlog (INVARIANT 13).
    expect((await runRetention(db, NOW)).redacted).toBe(RETENTION_BATCH);
    expect((await runRetention(db, NOW)).redacted).toBe(10);
    expect((await runRetention(db, NOW)).redacted).toBe(0);
  });

  it("reports the cutoff it used", () => {
    const line = describeSweep({ redacted: 3, cutoff: Date.UTC(2026, 5, 25) });
    expect(line).toContain("3 visit(s)");
    expect(line).toContain("2026-06-25");
  });
});

/**
 * The cron wiring, not the sweep.
 *
 * `runRetention` being correct is worth nothing if nothing calls it, and a Cron
 * Trigger that is not wired fails silently — no error, no request, just a table
 * that quietly keeps its positions for ever.
 */
describe("the scheduled handler", () => {
  it("runs the sweep when the cron fires", async () => {
    const db = getDb(env.DB);
    const p = crypto.randomUUID();
    await seedProspect(p);
    const id = await seedVisit(p, { receivedAt: Date.now() - RETENTION_MS - 60_000 });

    const ctx = createExecutionContext();
    await worker.scheduled({} as ScheduledController, env, ctx);
    // The handler defers the work with waitUntil, so the test waits for it.
    await waitOnExecutionContext(ctx);

    const [row] = await db.select().from(visits).where(eq(visits.id, id));
    expect(row?.lat).toBeNull();
    expect(row?.notes).toBeNull();
  });

  it("swallows a failure rather than looping against the daily quota", async () => {
    const ctx = createExecutionContext();
    const broken = { DB: undefined } as unknown as typeof env;
    // Must not throw: a cron that throws retries, and a retry loop against D1
    // burns the free-tier quota for nothing. Tomorrow's run picks up the same
    // rows anyway, because the sweep is idempotent.
    await expect(worker.scheduled({} as ScheduledController, broken, ctx)).resolves.toBeUndefined();
    await waitOnExecutionContext(ctx);
  });
});

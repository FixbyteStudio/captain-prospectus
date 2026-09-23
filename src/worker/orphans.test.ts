import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { prospects, scripts, visits, visitsOrphaned } from "./db/schema";
import type { OrphanRepairResult, OrphansResponse } from "../shared/schemas";

/**
 * The repair queue — ADR-0022.
 *
 * Once a visit is quarantined the phone has been told it is `accepted` and has
 * dropped it, so this table is the only copy left. Every test here is about
 * that copy surviving until somebody deliberately decides otherwise.
 */

const ADMIN = "admin@example.com";
const AGENT = "agent@example.com";

async function call(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function post(path: string, body?: unknown): Promise<Response> {
  return call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function seedProspect(
  id: string,
  over: { name?: string; lat?: number | null; lng?: number | null } = {},
): Promise<void> {
  const db = getDb(env.DB);
  await db.insert(prospects).values({
    id,
    name: over.name ?? "Le Bistrot",
    type: "restaurant",
    lat: over.lat === undefined ? 50.85 : over.lat,
    lng: over.lng === undefined ? 4.35 : over.lng,
    address: null,
    phone: null,
    website: null,
    cuisine: null,
    source: "csv",
    sourceRef: null,
    dedupeKey: `test:${id}`,
    status: "assigned",
    assignedTo: AGENT,
    createdBy: ADMIN,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function quarantine(
  over: {
    id?: string;
    prospectId?: string;
    reason?: "unknown_prospect" | "not_assigned";
    lat?: number | null;
    lng?: number | null;
    outcome?: "interested" | "converted";
    quarantinedAt?: number;
  } = {},
): Promise<string> {
  const db = getDb(env.DB);
  const id = over.id ?? crypto.randomUUID();
  const now = Date.now();
  await db.insert(visitsOrphaned).values({
    id,
    prospectId: over.prospectId ?? crypto.randomUUID(),
    agentEmail: AGENT,
    visitedAt: now - 1000,
    clientVisitedAt: now - 1000,
    receivedAt: now,
    lat: over.lat === undefined ? 50.85 : over.lat,
    lng: over.lng === undefined ? 4.35 : over.lng,
    flyerGiven: true,
    outcome: over.outcome ?? "converted",
    followUpAt: null,
    notes: "Patron absent",
    scriptId: null,
    answers: {},
    clientVersion: 1,
    reason: over.reason ?? "unknown_prospect",
    quarantinedAt: over.quarantinedAt ?? now,
  });
  return id;
}

beforeEach(async () => {
  const db = getDb(env.DB);
  await db.delete(visits);
  await db.delete(visitsOrphaned);
  await db.delete(prospects);
  await db.delete(scripts);
});

describe("GET /api/admin/visits/orphaned", () => {
  it("lists the queue newest first", async () => {
    const now = Date.now();
    const older = await quarantine({ quarantinedAt: now - 10_000 });
    const newer = await quarantine({ quarantinedAt: now });

    const response = await call("/api/admin/visits/orphaned");
    expect(response.status).toBe(200);
    const body = (await response.json()) as OrphansResponse;

    expect(body.visits.map((v) => v.id)).toEqual([newer, older]);
    expect(body.remaining).toBe(0);
  });

  it("offers the nearest live prospects as candidates", async () => {
    const near = crypto.randomUUID();
    const far = crypto.randomUUID();
    await seedProspect(near, { name: "Tout près", lat: 50.8501, lng: 4.3501 });
    await seedProspect(far, { name: "Plus loin", lat: 50.9, lng: 4.4 });
    await quarantine({ lat: 50.85, lng: 4.35 });

    const body = (await (await call("/api/admin/visits/orphaned")).json()) as OrphansResponse;
    const [row] = body.visits;

    expect(row?.candidates.map((cand) => cand.id)).toEqual([near, far]);
    expect(row?.candidates[0]?.distanceM).toBeLessThan(row?.candidates[1]?.distanceM ?? 0);
  });

  it("offers no candidates when the visit recorded no position", async () => {
    await seedProspect(crypto.randomUUID());
    await quarantine({ lat: null, lng: null });

    const body = (await (await call("/api/admin/visits/orphaned")).json()) as OrphansResponse;
    expect(body.visits[0]?.candidates).toEqual([]);
  });

  it("names the prospect of a not_assigned row, and leaves an orphan's null", async () => {
    const known = crypto.randomUUID();
    await seedProspect(known, { name: "Chez Nous" });
    await quarantine({ prospectId: known, reason: "not_assigned" });
    await quarantine({ reason: "unknown_prospect" });

    const body = (await (await call("/api/admin/visits/orphaned")).json()) as OrphansResponse;
    const named = body.visits.find((v) => v.reason === "not_assigned");
    const orphan = body.visits.find((v) => v.reason === "unknown_prospect");

    expect(named?.prospectName).toBe("Chez Nous");
    expect(orphan?.prospectName).toBeNull();
  });

  it("is refused to an agent", async () => {
    const saved = env.DEV_USER_EMAIL;
    try {
      env.DEV_USER_EMAIL = AGENT;
      expect((await call("/api/admin/visits/orphaned")).status).toBe(403);
    } finally {
      env.DEV_USER_EMAIL = saved;
    }
  });
});

describe("POST /api/admin/visits/orphaned/:id/repair", () => {
  it("moves the visit into visits and derives the prospect's status", async () => {
    const db = getDb(env.DB);
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);
    const visitId = await quarantine({ outcome: "converted" });

    const response = await post(`/api/admin/visits/orphaned/${visitId}/repair`, { prospectId });
    expect(response.status).toBe(200);
    expect((await response.json()) as OrphanRepairResult).toMatchObject({ repaired: true });

    const [stored] = await db.select().from(visits);
    expect(stored?.id).toBe(visitId);
    expect(stored?.prospectId).toBe(prospectId);
    // The agent who really wrote it, not the admin who repaired it.
    expect(stored?.agentEmail).toBe(AGENT);
    expect(await db.select().from(visitsOrphaned)).toHaveLength(0);

    const [row] = await db.select().from(prospects).where(eq(prospects.id, prospectId));
    expect(row?.status).toBe("converted");
  });

  it("keeps the visit's own timestamps rather than reclamping at repair time", async () => {
    const db = getDb(env.DB);
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);
    const visitId = await quarantine();
    const [before] = await db.select().from(visitsOrphaned).where(eq(visitsOrphaned.id, visitId));

    await post(`/api/admin/visits/orphaned/${visitId}/repair`, { prospectId });

    const [stored] = await db.select().from(visits);
    expect(stored?.visitedAt).toBe(before?.visitedAt);
    expect(stored?.receivedAt).toBe(before?.receivedAt);
  });

  it("repairing twice is a no-op, not an error (INVARIANT 4)", async () => {
    const db = getDb(env.DB);
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);
    const visitId = await quarantine();

    await post(`/api/admin/visits/orphaned/${visitId}/repair`, { prospectId });
    const second = await post(`/api/admin/visits/orphaned/${visitId}/repair`, { prospectId });

    expect(second.status).toBe(200);
    expect((await second.json()) as OrphanRepairResult).toMatchObject({ repaired: false });
    expect(await db.select().from(visits)).toHaveLength(1);
  });

  it("follows a merge rather than attaching the visit to the absorbed prospect", async () => {
    const db = getDb(env.DB);
    const survivor = crypto.randomUUID();
    const absorbed = crypto.randomUUID();
    await seedProspect(survivor, { name: "Survivant" });
    await seedProspect(absorbed, { name: "Absorbé" });
    await db.update(prospects).set({ mergedInto: survivor }).where(eq(prospects.id, absorbed));
    const visitId = await quarantine({ outcome: "converted" });

    // A prospect can be merged away in the window between a visit being
    // quarantined and an admin repairing it.
    const response = await post(`/api/admin/visits/orphaned/${visitId}/repair`, {
      prospectId: absorbed,
    });

    expect(response.status).toBe(200);
    // The response says where it actually landed, not where it was aimed.
    expect((await response.json()) as OrphanRepairResult).toMatchObject({
      prospectId: survivor,
    });

    const [stored] = await db.select().from(visits);
    expect(stored?.prospectId).toBe(survivor);

    const [alive] = await db.select().from(prospects).where(eq(prospects.id, survivor));
    expect(alive?.status).toBe("converted");
    // The retired prospect gains nothing.
    const [dead] = await db.select().from(prospects).where(eq(prospects.id, absorbed));
    expect(dead?.status).toBe("assigned");
  });

  it("refuses a target prospect that does not exist, and keeps the row", async () => {
    const db = getDb(env.DB);
    const visitId = await quarantine();

    const response = await post(`/api/admin/visits/orphaned/${visitId}/repair`, {
      prospectId: crypto.randomUUID(),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unknown_prospect" });
    // The only copy of this visit must survive a refused repair.
    expect(await db.select().from(visitsOrphaned)).toHaveLength(1);
  });

  it("404s an id that was never quarantined", async () => {
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);
    const response = await post(`/api/admin/visits/orphaned/${crypto.randomUUID()}/repair`, {
      prospectId,
    });
    expect(response.status).toBe(404);
  });

  it("is refused to an agent", async () => {
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);
    const visitId = await quarantine();
    const saved = env.DEV_USER_EMAIL;
    try {
      env.DEV_USER_EMAIL = AGENT;
      const response = await post(`/api/admin/visits/orphaned/${visitId}/repair`, { prospectId });
      expect(response.status).toBe(403);
    } finally {
      env.DEV_USER_EMAIL = saved;
    }
    expect(await getDb(env.DB).select().from(visitsOrphaned)).toHaveLength(1);
  });
});

describe("POST /api/admin/visits/orphaned/:id/discard", () => {
  it("removes the row", async () => {
    const db = getDb(env.DB);
    const visitId = await quarantine();

    const response = await post(`/api/admin/visits/orphaned/${visitId}/discard`);
    expect(response.status).toBe(200);
    expect(await db.select().from(visitsOrphaned)).toHaveLength(0);
    // Discarding is the one deliberate loss; it must never quietly become a visit.
    expect(await db.select().from(visits)).toHaveLength(0);
  });

  it("discarding twice is a no-op", async () => {
    const visitId = await quarantine();
    await post(`/api/admin/visits/orphaned/${visitId}/discard`);
    expect((await post(`/api/admin/visits/orphaned/${visitId}/discard`)).status).toBe(200);
  });

  it("is refused to an agent", async () => {
    const visitId = await quarantine();
    const saved = env.DEV_USER_EMAIL;
    try {
      env.DEV_USER_EMAIL = AGENT;
      expect((await post(`/api/admin/visits/orphaned/${visitId}/discard`)).status).toBe(403);
    } finally {
      env.DEV_USER_EMAIL = saved;
    }
    expect(await getDb(env.DB).select().from(visitsOrphaned)).toHaveLength(1);
  });
});

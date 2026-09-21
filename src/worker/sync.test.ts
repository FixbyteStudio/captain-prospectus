import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import { getDb } from "./db/client";
import { prospects, visits } from "./db/schema";
import type { SyncRequest, SyncResponse } from "../shared/schemas";

/**
 * Routes against a real D1, built by the real migrations.
 * DEV_USER_EMAIL is bound in vitest.config.ts, so these run as an identified
 * user exactly as localhost development does.
 */

const AGENT = "admin@example.com";

async function call(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function sync(body: Partial<SyncRequest>): Promise<Response> {
  return call("/api/agent/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientVersion: 1, prospects: [], visits: [], ...body }),
  });
}

async function seedProspect(id: string): Promise<void> {
  const db = getDb(env.DB);
  await db.insert(prospects).values({
    id,
    name: "Le Bistrot",
    type: "restaurant",
    lat: 48.85,
    lng: 2.35,
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

beforeEach(async () => {
  const db = getDb(env.DB);
  await db.delete(visits);
  await db.delete(prospects);
});

describe("GET /api/me", () => {
  it("returns the identity and the derived role", async () => {
    const response = await call("/api/me");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: AGENT, role: "admin" });
  });
});

describe("POST /api/agent/sync", () => {
  it("rejects a body that does not match the schema", async () => {
    const response = await sync({ visits: [{ id: "not-a-uuid" }] as never });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("validation");
  });

  it("requires followUpAt when the outcome is follow_up", async () => {
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);

    const response = await sync({
      visits: [
        {
          id: crypto.randomUUID(),
          prospectId,
          visitedAt: Date.now(),
          flyerGiven: true,
          outcome: "follow_up",
          answers: {},
        } as never,
      ],
    });
    expect(response.status).toBe(400);
  });

  it("stores a visit and derives the prospect's status on the server", async () => {
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);

    const response = await sync({
      visits: [
        {
          id: crypto.randomUUID(),
          prospectId,
          visitedAt: Date.now(),
          flyerGiven: true,
          outcome: "converted",
          answers: {},
        } as never,
      ],
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as SyncResponse;
    expect(body.accepted.visits).toHaveLength(1);

    const db = getDb(env.DB);
    const [row] = await db.select().from(prospects);
    // INVARIANT 3: the client sent an outcome, never a status.
    expect(row?.status).toBe("converted");
  });

  it("is idempotent: resending the same payload changes nothing", async () => {
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);
    const payload = {
      visits: [
        {
          id: crypto.randomUUID(),
          prospectId,
          visitedAt: Date.now(),
          flyerGiven: false,
          outcome: "interested",
          answers: {},
        } as never,
      ],
    };

    await sync(payload);
    const second = await sync(payload);
    expect(second.status).toBe(200);

    const db = getDb(env.DB);
    expect(await db.select().from(visits)).toHaveLength(1);
    // Accepted again, so a phone that missed the first response can clear it.
    expect(((await second.json()) as SyncResponse).accepted.visits).toHaveLength(1);
  });

  it("clamps a visit dated in the future so it cannot freeze the status", async () => {
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);
    const oneYearAhead = Date.now() + 365 * 24 * 3600 * 1000;

    await sync({
      visits: [
        {
          id: crypto.randomUUID(),
          prospectId,
          visitedAt: oneYearAhead,
          flyerGiven: false,
          outcome: "interested",
          answers: {},
        } as never,
      ],
    });

    const db = getDb(env.DB);
    const [stored] = await db.select().from(visits);

    // INVARIANT 12: stored time is clamped, raw phone clock is preserved.
    expect(stored?.visitedAt).toBeLessThanOrEqual(Date.now());
    expect(stored?.clientVisitedAt).toBe(oneYearAhead);

    // A later, honest visit must still win.
    await sync({
      visits: [
        {
          id: crypto.randomUUID(),
          prospectId,
          visitedAt: Date.now(),
          flyerGiven: false,
          outcome: "not_interested",
          answers: {},
        } as never,
      ],
    });
    const [row] = await db.select().from(prospects);
    expect(row?.status).toBe("rejected");
  });

  it("records the contract version of the sending build", async () => {
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);
    await sync({
      clientVersion: 1,
      visits: [
        {
          id: crypto.randomUUID(),
          prospectId,
          visitedAt: Date.now(),
          flyerGiven: false,
          outcome: "interested",
          answers: {},
        } as never,
      ],
    });

    const db = getDb(env.DB);
    const [stored] = await db.select().from(visits);
    expect(stored?.clientVersion).toBe(1);
  });

  it("answers 426 for a build below the minimum supported version", async () => {
    const response = await sync({ clientVersion: 0 });
    expect(response.status).toBe(426);
  });

  it("returns the existing prospect's id when a field prospect already exists", async () => {
    // Same name and position as the seeded prospect, so the dedupe key collides.
    const db = getDb(env.DB);
    const existingId = crypto.randomUUID();
    await db.insert(prospects).values({
      id: existingId,
      name: "Le Bistrot",
      type: "restaurant",
      lat: 48.85,
      lng: 2.35,
      address: null,
      phone: null,
      website: null,
      cuisine: null,
      source: "csv",
      sourceRef: null,
      dedupeKey: "geo:le-bistrot:48.850:2.350",
      status: "new",
      assignedTo: null,
      createdBy: AGENT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const clientId = crypto.randomUUID();
    const response = await sync({
      prospects: [
        {
          id: clientId,
          name: "Le Bistrot",
          type: "restaurant",
          lat: 48.85,
          lng: 2.35,
          createdAt: Date.now(),
        } as never,
      ],
    });

    const body = (await response.json()) as SyncResponse;
    expect(body.idMap[clientId]).toBe(existingId);
    expect(body.accepted.prospects).toContain(clientId);
    expect(await db.select().from(prospects)).toHaveLength(1);
  });

  it("inserts more rows than fit in one D1 statement", async () => {
    // Regression: the per-row parameter count used to be hand-counted and was
    // wrong, so any batch large enough to need chunking failed outright
    // (INVARIANT 7). 30 field prospects needs several statements.
    const created = Array.from({ length: 30 }, (_, i) => ({
      id: crypto.randomUUID(),
      name: `Découverte ${i}`,
      type: "food_truck" as const,
      lat: 45.75 + i * 0.001,
      lng: 4.83,
      createdAt: Date.now(),
    }));

    const response = await sync({ prospects: created as never });
    expect(response.status).toBe(200);

    const body = (await response.json()) as SyncResponse;
    expect(body.accepted.prospects).toHaveLength(30);

    const db = getDb(env.DB);
    expect(await db.select().from(prospects)).toHaveLength(30);
  });

  it("neither stores nor accepts a visit whose prospect is unknown", async () => {
    // Deliberate: accepting it would tell the phone to delete a visit the
    // server never stored, which is exactly the loss INVARIANT 5 forbids.
    //
    // KNOWN GAP: the phone therefore keeps retrying it. That self-heals when
    // the prospect is simply in a later outbox page, but not when the prospect
    // genuinely no longer exists — then the outbox never drains and the phone
    // resends on every sync. Closing it needs an additive `rejected` field in
    // the response plus client handling; see the sync-contract-change skill.
    const response = await sync({
      visits: [
        {
          id: crypto.randomUUID(),
          prospectId: crypto.randomUUID(), // never inserted
          visitedAt: Date.now(),
          flyerGiven: false,
          outcome: "interested",
          answers: {},
        } as never,
      ],
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as SyncResponse;
    expect(body.accepted.visits).toHaveLength(0);

    const db = getDb(env.DB);
    expect(await db.select().from(visits)).toHaveLength(0);
  });

  it("accepts a visit against a field prospect created in the same payload", async () => {
    // The ordinary case the filter must not break: prospects are inserted
    // before visits precisely so a visit can reference one of them.
    const clientProspectId = crypto.randomUUID();
    const response = await sync({
      prospects: [
        {
          id: clientProspectId,
          name: "Camion du marché",
          type: "food_truck",
          lat: 45.76,
          lng: 4.83,
          createdAt: Date.now(),
        } as never,
      ],
      visits: [
        {
          id: crypto.randomUUID(),
          prospectId: clientProspectId,
          visitedAt: Date.now(),
          flyerGiven: true,
          outcome: "interested",
          answers: {},
        } as never,
      ],
    });

    const body = (await response.json()) as SyncResponse;
    expect(body.accepted.visits).toHaveLength(1);
    expect(await getDb(env.DB).select().from(visits)).toHaveLength(1);
  });

  it("pulls back only the agent's open prospects", async () => {
    const db = getDb(env.DB);
    const mine = crypto.randomUUID();
    await seedProspect(mine);
    await db.insert(prospects).values({
      id: crypto.randomUUID(),
      name: "Fermé",
      type: "bar",
      lat: null,
      lng: null,
      address: null,
      phone: null,
      website: null,
      cuisine: null,
      source: "csv",
      sourceRef: null,
      dedupeKey: "test:closed",
      status: "converted",
      assignedTo: AGENT,
      createdBy: AGENT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const body = (await (await sync({})).json()) as SyncResponse;
    expect(body.prospects.map((p) => p.id)).toEqual([mine]);
  });
});

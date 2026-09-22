import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { prospects, scripts, visits } from "./db/schema";
import { visitHistoryResponseSchema } from "../shared/schemas";
import {
  MAX_REQUEST_BYTES,
  SYNC_PROSPECTS_PER_REQUEST,
  SYNC_VISITS_PER_REQUEST,
} from "../shared/constants";
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
  // Order matters: visits reference both of the others by foreign key.
  await db.delete(visits);
  await db.delete(prospects);
  await db.delete(scripts);
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

  /**
   * docs/security.md, "Malformed or oversized payloads". The body here is not
   * valid JSON at all, so a 400 or a 500 would prove the cap ran *after* the
   * parse it exists to prevent (INVARIANT 13).
   */
  it("refuses a body over MAX_REQUEST_BYTES before parsing it", async () => {
    const response = await call("/api/agent/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(MAX_REQUEST_BYTES + 1),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "too_large" });
  });

  /**
   * The other direction, and the one that matters more: a cap set below what a
   * phone can legitimately build answers 413 to a payload the outbox rebuilds
   * identically for ever (INVARIANT 5).
   */
  it("accepts a full batch of visits carrying maximum-length notes", async () => {
    const db = getDb(env.DB);
    // Two visits each to 100 prospects rather than one each to 200: a payload
    // referencing more than 100 distinct prospects trips D1's bound-parameter
    // limit in the route's own lookup, which is a separate bug (INVARIANT 7,
    // filed). The byte size this test is about is the same either way.
    const ids = Array.from({ length: SYNC_PROSPECTS_PER_REQUEST }, () => crypto.randomUUID());
    for (const id of ids) await seedProspect(id);

    const response = await sync({
      visits: [...ids, ...ids].map((prospectId) => ({
        id: crypto.randomUUID(),
        prospectId,
        visitedAt: Date.now(),
        flyerGiven: true,
        outcome: "interested" as const,
        notes: "é".repeat(2000),
        answers: {},
      })),
    });

    expect(response.status).toBe(200);
    expect(await db.select().from(visits)).toHaveLength(SYNC_VISITS_PER_REQUEST);
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

describe("POST /api/agent/sync — the script a visit was answered with", () => {
  async function seedScript(): Promise<number> {
    const db = getDb(env.DB);
    const [row] = await db
      .insert(scripts)
      .values({
        name: "Questionnaire",
        version: 1,
        questions: [{ key: "has_delivery", label: "Livraison ?", type: "yes_no" }],
        isActive: true,
        createdAt: Date.now(),
      })
      .returning({ id: scripts.id });
    if (!row) throw new Error("seed failed");
    return row.id;
  }

  it("pulls the active script down on every sync", async () => {
    const scriptId = await seedScript();
    const body = (await (await sync({})).json()) as SyncResponse;

    expect(body.script?.id).toBe(scriptId);
    expect(body.script?.questions).toHaveLength(1);
  });

  it("pulls null when no script has been saved yet", async () => {
    const body = (await (await sync({})).json()) as SyncResponse;
    expect(body.script).toBeNull();
  });

  it("stores the script id and the answers a visit was given", async () => {
    const scriptId = await seedScript();
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);

    const visitId = crypto.randomUUID();
    const response = await sync({
      visits: [
        {
          id: visitId,
          prospectId,
          visitedAt: Date.now(),
          flyerGiven: true,
          outcome: "interested",
          scriptId,
          answers: { has_delivery: true },
        },
      ],
    });
    expect(response.status).toBe(200);

    const db = getDb(env.DB);
    const [row] = await db
      .select({ scriptId: visits.scriptId, answers: visits.answers })
      .from(visits)
      .where(eq(visits.id, visitId));

    expect(row?.scriptId).toBe(scriptId);
    expect(row?.answers).toEqual({ has_delivery: true });
  });

  /**
   * INVARIANT 5. `visits.script_id` is a foreign key, so a visit naming a
   * script this database does not have would fail the whole chunked insert and
   * cost the agent every visit in the batch. Refusing the visit instead would
   * strand it in the outbox for ever (docs/backlog/003). The visit is true
   * either way — only the questionnaire reference is stale.
   */
  it("keeps a visit whose script id this database does not know, answers and all", async () => {
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);

    const visitId = crypto.randomUUID();
    const response = await sync({
      visits: [
        {
          id: visitId,
          prospectId,
          visitedAt: Date.now(),
          flyerGiven: false,
          outcome: "interested",
          scriptId: 424_242,
          answers: { has_delivery: false },
        },
      ],
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as SyncResponse;
    expect(body.accepted.visits).toContain(visitId);

    const db = getDb(env.DB);
    const [row] = await db
      .select({ scriptId: visits.scriptId, answers: visits.answers })
      .from(visits)
      .where(eq(visits.id, visitId));

    expect(row?.scriptId).toBeNull();
    expect(row?.answers).toEqual({ has_delivery: false });
  });

  it("does not let one unknown script id take down the rest of the batch", async () => {
    const scriptId = await seedScript();
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);

    const good = crypto.randomUUID();
    const stale = crypto.randomUUID();
    const base = { prospectId, visitedAt: Date.now(), flyerGiven: false, outcome: "interested" };

    const response = await sync({
      visits: [
        { ...base, id: good, scriptId, answers: {} },
        { ...base, id: stale, scriptId: 424_242, answers: {} },
      ] as SyncRequest["visits"],
    });

    const body = (await response.json()) as SyncResponse;
    expect(body.accepted.visits).toEqual(expect.arrayContaining([good, stale]));
  });
});

describe("GET /api/agent/prospects/:id/visits", () => {
  const PROSPECT = "33333333-3333-4333-8333-333333333333";

  it("rejects an id that is not a UUID with 400, not 404", async () => {
    // A malformed id is a client bug; a well-formed unknown one is a 404.
    const response = await call("/api/agent/prospects/not-a-uuid/visits");
    expect(response.status).toBe(400);
  });

  it("404s a prospect that does not exist", async () => {
    const response = await call(`/api/agent/prospects/${PROSPECT}/visits`);
    expect(response.status).toBe(404);
  });

  it("returns the history newest first, matching the shared contract", async () => {
    await seedProspect(PROSPECT);
    await sync({
      visits: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          prospectId: PROSPECT,
          visitedAt: 1_600_000_000_000,
          flyerGiven: true,
          outcome: "interested",
          notes: "ferme le lundi",
          answers: {},
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          prospectId: PROSPECT,
          visitedAt: 1_600_000_100_000,
          flyerGiven: false,
          outcome: "not_interested",
          answers: {},
        },
      ],
    });

    const response = await call(`/api/agent/prospects/${PROSPECT}/visits`);
    expect(response.status).toBe(200);

    const body = visitHistoryResponseSchema.parse(await response.json());
    expect(body.visits.map((v) => v.outcome)).toEqual(["not_interested", "interested"]);
    expect(body.visits[1]?.notes).toBe("ferme le lundi");
  });

  it("leaks no clock-skew or upgrade diagnostics", async () => {
    await seedProspect(PROSPECT);
    await sync({
      visits: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          prospectId: PROSPECT,
          visitedAt: 1_600_000_000_000,
          flyerGiven: true,
          outcome: "interested",
          answers: {},
        },
      ],
    });

    const body = (await (await call(`/api/agent/prospects/${PROSPECT}/visits`)).json()) as {
      visits: Record<string, unknown>[];
    };

    const entry = body.visits[0] ?? {};
    expect(entry).not.toHaveProperty("clientVisitedAt");
    expect(entry).not.toHaveProperty("receivedAt");
    expect(entry).not.toHaveProperty("clientVersion");
  });
});

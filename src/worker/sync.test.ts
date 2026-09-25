import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import { eq } from "drizzle-orm";
import { boundParamsPerRow, getDb } from "./db/client";
import { chunk } from "../shared/chunk";
import { prospects, scripts, visits, visitsOrphaned } from "./db/schema";
import { visitHistoryResponseSchema } from "../shared/schemas";
import type { Outcome } from "../shared/constants";
import { MAX_REQUEST_BYTES, SYNC_VISITS_PER_REQUEST } from "../shared/constants";
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

async function seedProspect(id: string, owner: string | null = AGENT): Promise<void> {
  await seedProspects([id], owner);
}

/** Many at once: 150 sequential inserts would dominate a test's runtime. */
async function seedProspects(ids: readonly string[], owner: string | null = AGENT): Promise<void> {
  const db = getDb(env.DB);
  const now = Date.now();
  const rows = ids.map((id) => ({
    id,
    name: "Le Bistrot",
    type: "restaurant" as const,
    lat: 48.85,
    lng: 2.35,
    address: null,
    phone: null,
    website: null,
    cuisine: null,
    source: "csv" as const,
    sourceRef: null,
    dedupeKey: `test:${id}`,
    status: "assigned" as const,
    assignedTo: owner,
    createdBy: AGENT,
    createdAt: now,
    updatedAt: now,
  }));
  for (const batch of chunk(rows, boundParamsPerRow(prospects))) {
    await db.insert(prospects).values(batch);
  }
}

beforeEach(async () => {
  const db = getDb(env.DB);
  // Order matters: visits reference both of the others by foreign key.
  await db.delete(visits);
  // No foreign keys of its own, but it holds rows across tests just the same.
  await db.delete(visitsOrphaned);
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
    const ids = Array.from({ length: SYNC_VISITS_PER_REQUEST }, () => crypto.randomUUID());
    await seedProspects(ids);

    const response = await sync({
      visits: ids.map((prospectId) => ({
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

  /**
   * #30, INVARIANT 7. A week offline is enough to reach 150 distinct doors, and
   * every id in the route's prospect lookup binds one parameter: unchunked, the
   * statement breaches D1's 100 and 500s. A 500 rightly keeps the outbox
   * (INVARIANT 5), so the phone would rebuild the same payload for ever.
   *
   * The orphan assertion is the other half: a lookup that chunked but kept only
   * one batch's rows would still answer 200, quietly quarantining the visits it
   * could no longer match to a prospect.
   */
  it("accepts visits spread over more distinct prospects than D1 can bind", async () => {
    const db = getDb(env.DB);
    const ids = Array.from({ length: 150 }, () => crypto.randomUUID());
    await seedProspects(ids);

    const response = await sync({
      visits: ids.map((prospectId) => ({
        id: crypto.randomUUID(),
        prospectId,
        visitedAt: Date.now(),
        flyerGiven: true,
        outcome: "interested" as const,
        answers: {},
      })),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as SyncResponse;
    expect(body.accepted.visits).toHaveLength(150);
    expect(await db.select().from(visits)).toHaveLength(150);
    expect(await db.select().from(visitsOrphaned)).toHaveLength(0);
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

  it("quarantines a visit whose prospect is unknown, and accepts it", async () => {
    // ADR-0022. This used to be neither stored nor accepted, which kept the
    // visit safe but left the phone resending it for ever whenever the prospect
    // genuinely was not coming. It is now stored in visits_orphaned, where it
    // is just as safe, and reported in `accepted` so the outbox drains —
    // `accepted` means the server has durably taken the visit, not that a row
    // exists in `visits`.
    const id = crypto.randomUUID();
    const response = await sync({
      visits: [
        {
          id,
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
    expect(body.accepted.visits).toContain(id);

    const db = getDb(env.DB);
    expect(await db.select().from(visits)).toHaveLength(0);
    const [held] = await db.select().from(visitsOrphaned);
    expect(held?.id).toBe(id);
    expect(held?.reason).toBe("unknown_prospect");
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

  /**
   * The script lookup is chunked for the same reason as the prospect one (#30,
   * INVARIANT 7): nothing caps how many distinct script ids a batch names, so
   * 150 of them bound 150 parameters and 500d.
   *
   * The known id goes first, in the first chunk: a lookup that kept only the
   * last chunk's rows would null it and still answer 200.
   */
  it("resolves more distinct script ids than D1 can bind", async () => {
    const scriptId = await seedScript();
    const prospectId = crypto.randomUUID();
    await seedProspect(prospectId);

    const base = { prospectId, visitedAt: Date.now(), flyerGiven: false, outcome: "interested" };
    const response = await sync({
      visits: Array.from({ length: 150 }, (_, i) => ({
        ...base,
        id: crypto.randomUUID(),
        // Distinct and unknown, except the first — 424_242 upwards is nobody's id.
        scriptId: i === 0 ? scriptId : 424_242 + i,
        answers: {},
      })) as SyncRequest["visits"],
    });

    expect(response.status).toBe(200);
    const db = getDb(env.DB);
    const stored = await db.select({ scriptId: visits.scriptId }).from(visits);
    expect(stored).toHaveLength(150);
    expect(stored.filter((r) => r.scriptId === scriptId)).toHaveLength(1);
    expect(stored.filter((r) => r.scriptId === null)).toHaveLength(149);
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

/**
 * ADR-0022 and #33.
 *
 * Sync used to check only that a visit's prospect *existed*, so any agent past
 * Access could post a visit against any prospect id and — because the server
 * derives status from the newest visit — change it. Such a visit is now
 * quarantined: kept, attributed, accepted, and inert until an admin decides
 * where it belongs.
 */
describe("POST /api/agent/sync — a visit for someone else's prospect", () => {
  const OTHER = "agent@example.com";

  const visitOf = (prospectId: string, outcome: Outcome) => ({
    id: crypto.randomUUID(),
    prospectId,
    visitedAt: Date.now(),
    flyerGiven: false,
    outcome,
    answers: {},
  });

  /** Runs one sync as somebody else, then restores the ambient identity. */
  async function asOtherAgent(body: Partial<SyncRequest>): Promise<Response> {
    const saved = env.DEV_USER_EMAIL;
    try {
      env.DEV_USER_EMAIL = OTHER;
      return await sync(body);
    } finally {
      env.DEV_USER_EMAIL = saved;
    }
  }

  it("does not let another agent reject a prospect out of its owner's round", async () => {
    const db = getDb(env.DB);
    const id = crypto.randomUUID();
    await seedProspect(id, AGENT);

    const response = await asOtherAgent({ visits: [visitOf(id, "not_interested")] });
    expect(response.status).toBe(200);

    const [row] = await db.select().from(prospects).where(eq(prospects.id, id));
    // "rejected" is outside OPEN_STATUSES, which is what would have dropped it
    // off the owner's today list.
    expect(row?.status).toBe("assigned");
    expect(row?.lastVisitAt).toBeNull();
  });

  it("quarantines it rather than storing it, and accepts it all the same", async () => {
    const db = getDb(env.DB);
    const id = crypto.randomUUID();
    await seedProspect(id, AGENT);
    const visit = visitOf(id, "not_interested");

    const response = await asOtherAgent({ visits: [visit] });
    const body = (await response.json()) as SyncResponse;

    // Accepted, so the phone clears its outbox instead of resending for ever.
    expect(body.accepted.visits).toContain(visit.id);
    expect(await db.select().from(visits)).toHaveLength(0);

    const [held] = await db.select().from(visitsOrphaned);
    expect(held?.id).toBe(visit.id);
    expect(held?.reason).toBe("not_assigned");
    // It keeps the prospect it named, so approving it is just a repair against
    // that same id.
    expect(held?.prospectId).toBe(id);
    // Attributed to whoever really wrote it (INVARIANT 10), never the assignee.
    expect(held?.agentEmail).toBe(OTHER);
  });

  it("still derives status from the assignee's own visit", async () => {
    const db = getDb(env.DB);
    const id = crypto.randomUUID();
    await seedProspect(id, AGENT);

    await sync({ visits: [visitOf(id, "not_interested")] });

    const [row] = await db.select().from(prospects).where(eq(prospects.id, id));
    expect(row?.status).toBe("rejected");
    expect(await db.select().from(visitsOrphaned)).toHaveLength(0);
  });

  it("does not let a later outsider visit undo the assignee's outcome", async () => {
    const db = getDb(env.DB);
    const id = crypto.randomUUID();
    await seedProspect(id, AGENT);

    await sync({ visits: [visitOf(id, "converted")] });
    await asOtherAgent({ visits: [visitOf(id, "not_interested")] });

    const [row] = await db.select().from(prospects).where(eq(prospects.id, id));
    expect(row?.status).toBe("converted");
  });

  it("quarantines a visit for an unassigned prospect", async () => {
    const db = getDb(env.DB);
    const id = crypto.randomUUID();
    await seedProspect(id, null);

    await sync({ visits: [visitOf(id, "converted")] });

    const [row] = await db.select().from(prospects).where(eq(prospects.id, id));
    expect(row?.status).toBe("assigned");
    expect((await db.select().from(visitsOrphaned))[0]?.reason).toBe("not_assigned");
  });

  it("replaying a quarantined payload stays a no-op", async () => {
    const db = getDb(env.DB);
    const id = crypto.randomUUID();
    await seedProspect(id, AGENT);
    const visit = visitOf(id, "interested");

    await asOtherAgent({ visits: [visit] });
    await asOtherAgent({ visits: [visit] });

    expect(await db.select().from(visitsOrphaned)).toHaveLength(1);
  });
});

describe("POST /api/agent/sync — a late visit against a newer outcome", () => {
  const DAY = 24 * 3600 * 1000;

  const visitAt = (prospectId: string, outcome: Outcome, visitedAt: number) => ({
    id: crypto.randomUUID(),
    prospectId,
    visitedAt,
    flyerGiven: false,
    outcome,
    answers: {},
    ...(outcome === "follow_up" && { followUpAt: visitedAt + 7 * DAY }),
  });

  function patch(id: string, body: Record<string, unknown>): Promise<Response> {
    return call(`/api/admin/prospects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function prospect(id: string) {
    const [row] = await getDb(env.DB).select().from(prospects).where(eq(prospects.id, id));
    return row;
  }

  it("does not let an older visit that syncs later overwrite a newer outcome (ADR-0011)", async () => {
    const id = crypto.randomUUID();
    await seedProspect(id);
    const now = Date.now();

    await sync({ visits: [visitAt(id, "converted", now - DAY)] });
    await sync({ visits: [visitAt(id, "not_interested", now - 3 * DAY)] });

    const row = await prospect(id);
    expect(row?.status).toBe("converted");
    expect(row?.lastVisitAt).toBe(now - DAY);
  });

  it("keeps an admin's manual status against a visit made before it (ADR-0025)", async () => {
    const id = crypto.randomUUID();
    await seedProspect(id);
    const monday = Date.now() - 2 * DAY;

    // Tuesday: the admin closes it after a phone call.
    expect((await patch(id, { status: "converted", nextVisitAt: null })).status).toBe(200);

    // Wednesday: Monday's offline visit finally syncs.
    const response = await sync({ visits: [visitAt(id, "follow_up", monday)] });
    const body = (await response.json()) as SyncResponse;

    const row = await prospect(id);
    expect(row?.status).toBe("converted");
    // The visit is still a fact: it is stored and dates the last visit…
    expect(row?.lastVisitAt).toBe(monday);
    // …but it does not schedule a follow-up on a prospect the admin closed.
    expect(row?.nextVisitAt).toBeNull();
    expect(body.accepted.visits).toHaveLength(1);
    expect(body.prospects.map((p) => p.id)).not.toContain(id);
  });

  it("still lets a visit made after the admin's change move the status", async () => {
    const id = crypto.randomUUID();
    await seedProspect(id);

    await patch(id, { status: "rejected" });
    await sync({ visits: [visitAt(id, "interested", Date.now())] });

    expect((await prospect(id))?.status).toBe("follow_up");
  });

  it("settles two visits with the same visited_at by id, whatever order they arrive in", async () => {
    const id = crypto.randomUUID();
    await seedProspect(id);
    const sameMoment = Date.now() - DAY;
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    const [lower, higher] = a < b ? [a, b] : [b, a];

    // Same sync, so both share a received_at: only the id can decide. The
    // winner is sent first, so the order of the array is not what settles it.
    await sync({
      visits: [
        { ...visitAt(id, "converted", sameMoment), id: higher },
        { ...visitAt(id, "not_interested", sameMoment), id: lower },
      ],
    });

    expect((await prospect(id))?.status).toBe("converted");
  });

  it("prefers the visit received last when visited_at ties across two syncs", async () => {
    const id = crypto.randomUUID();
    await seedProspect(id);
    const sameMoment = Date.now() - DAY;
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    const [lower, higher] = a < b ? [a, b] : [b, a];

    await sync({ visits: [{ ...visitAt(id, "converted", sameMoment), id: higher }] });
    // Push the first one an hour back so the two received_at cannot land on the
    // same millisecond, and give it the higher id, so only received_at can put
    // the second visit last.
    await getDb(env.DB)
      .update(visits)
      .set({ receivedAt: Date.now() - 3600 * 1000 })
      .where(eq(visits.id, higher));
    await sync({ visits: [{ ...visitAt(id, "not_interested", sameMoment), id: lower }] });

    expect((await prospect(id))?.status).toBe("rejected");
  });

  it("does not treat an assignment as a manual status", async () => {
    const id = crypto.randomUUID();
    await seedProspect(id);

    await patch(id, { assignedTo: AGENT });
    await sync({ visits: [visitAt(id, "interested", Date.now() - DAY)] });

    expect((await prospect(id))?.status).toBe("follow_up");
  });
});

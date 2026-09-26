import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import {
  and,
  count,
  countDistinct,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  gt,
  sql,
} from "drizzle-orm";
import { getDb } from "./db/client";
import { prospects, scripts, visits, visitsOrphaned } from "./db/schema";
import { DASHBOARD_PERIODS, MAX_REQUEST_BYTES, STATUSES } from "../shared/constants";
import { brusselsPeriod } from "../shared/period";
import { dedupeKey } from "../shared/dedupe";
import { devSeedResultSchema } from "../shared/schemas";
import type {
  DashboardResponse,
  DevSeed,
  DevSeedResult,
  DuplicatesResponse,
} from "../shared/schemas";

/**
 * The one route mounted before auth (src/worker/index.ts). The gate is pinned
 * first; then what a seed must leave behind for the dashboard (GH #108).
 */

async function callAt(origin: string, path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`${origin}${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  return callAt("http://localhost", path, init);
}

function seedBody(overrides?: Partial<DevSeed>): unknown {
  return {
    prospects: [
      {
        name: "Le Bistrot",
        type: "restaurant",
        lat: 50.85,
        lng: 4.35,
        address: "Rue Neuve 1",
        assignedTo: "agent@example.com",
      },
    ],
    script: {
      name: "Questionnaire",
      questions: [{ key: "has_pos", label: "Caisse en place ?", type: "yes_no" }],
    },
    ...overrides,
  };
}

async function postSeed(body: unknown): Promise<Response> {
  return call("/api/dev/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  const db = getDb(env.DB);
  // Order matters: visits reference both of the others by foreign key.
  await db.delete(visitsOrphaned);
  await db.delete(visits);
  await db.delete(prospects);
  await db.delete(scripts);
});

describe("POST /api/dev/seed", () => {
  it("seeds prospects and one active script", async () => {
    const response = await postSeed(seedBody());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ seeded: 1, inserted: { prospects: 1 } });

    const db = getDb(env.DB);
    const [row] = await db.select().from(prospects);
    expect(row?.name).toBe("Le Bistrot");
    // The agent's first prospect takes the first fixed story, converted at
    // k=2, and its status is derived from those visits as sync would.
    expect(row?.status).toBe("converted");
    expect(row?.createdBy).toBe("seed@localhost");

    const [script] = await db.select().from(scripts).where(eq(scripts.isActive, true));
    expect(script?.version).toBe(1);
  });

  it("derives status new when nothing is assigned", async () => {
    await postSeed(
      seedBody({
        prospects: [
          {
            name: "Chez Nous",
            type: "cafe",
            lat: null,
            lng: null,
            address: null,
            assignedTo: null,
          },
        ],
      }),
    );
    const db = getDb(env.DB);
    const [row] = await db.select().from(prospects);
    expect(row?.status).toBe("new");
  });

  /** INVARIANT 6: the body used to be cast to a type and inserted unchecked. */
  it("rejects a body that does not match devSeedSchema", async () => {
    const response = await postSeed(
      seedBody({
        prospects: [
          { name: "x", type: "bakery", lat: null, lng: null, address: null, assignedTo: null },
        ] as never,
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "validation" });

    const db = getDb(env.DB);
    expect(await db.select().from(prospects)).toHaveLength(0);
  });

  /**
   * The script goes through scriptCreateSchema, so a seed can only contain a
   * questionnaire POST /api/admin/scripts would also have accepted.
   */
  it("rejects a script the admin API would reject", async () => {
    const response = await postSeed(
      seedBody({
        script: {
          name: "Questionnaire",
          // `single` with no options is the cross-field rule in questionSchema.
          questions: [{ key: "pos", label: "Caisse ?", type: "single" }],
        } as never,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("answers 404 off localhost, without writing anything", async () => {
    const response = await callAt("https://captain-prospectus.example.com", "/api/dev/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(seedBody()),
    });
    expect(response.status).toBe(404);
    // Nothing about the gate leaks off localhost.
    expect(await response.json()).toEqual({ error: "not_found" });

    const db = getDb(env.DB);
    expect(await db.select().from(prospects)).toHaveLength(0);
  });

  it("answers 404 when DEV_USER_EMAIL is not set", async () => {
    const saved = env.DEV_USER_EMAIL;
    try {
      delete (env as { DEV_USER_EMAIL?: string }).DEV_USER_EMAIL;
      const response = await postSeed(seedBody());
      expect(response.status).toBe(404);
      // On localhost the reason is spelled out; a fresh clone has no .dev.vars.
      expect(await response.json()).toMatchObject({
        message: expect.stringContaining("DEV_USER_EMAIL"),
      });
    } finally {
      env.DEV_USER_EMAIL = saved;
    }
  });

  /**
   * The regression test for the middleware ORDER in src/worker/index.ts.
   *
   * /api/dev/* is mounted before auth, and Hono composes handlers in
   * registration order — so a bodyLimit registered below that mount would never
   * run for this route. If someone moves it, this is the test that fails.
   */
  it("refuses an oversized body", async () => {
    const response = await call("/api/dev/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(MAX_REQUEST_BYTES + 1),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "too_large" });
  });
});

/* ------------------------------------------------ the dashboard's data (#108) */

const DEV = "admin@example.com";
const OTHER = "agent@example.com";

type SeedProspect = DevSeed["prospects"][number];

function place(name: string, lat: number, lng: number, assignedTo: string | null): SeedProspect {
  return { name, type: "restaurant", lat, lng, address: null, assignedTo };
}

/** 2 agents × 10, 2 unassigned, a duplicate pair, a merge and a manual status. */
function fullBody(extra: SeedProspect[] = []): DevSeed {
  const generated = Array.from({ length: 20 }, (_, i) =>
    // 0.002° of latitude is ~220 m: no two of these pair as duplicates.
    place(`Maison ${i}`, 50.9 + i * 0.002, 4.4, i % 2 === 0 ? DEV : OTHER),
  );
  return {
    prospects: [
      ...generated,
      place("Maison libre A", 50.95, 4.4, null),
      place("Maison libre B", 50.952, 4.4, null),
      place("Chez Léa", 50.85, 4.35, DEV),
      // ~11 m north: the live duplicate pair.
      place("Chez Léa et Paul", 50.8501, 4.35, DEV),
      place("Pizza Roma", 50.86, 4.36, OTHER),
      { ...place("Pizzeria Roma", 50.86, 4.36014, OTHER), mergeInto: "Pizza Roma" },
      { ...place("Le Jardin", 50.87, 4.37, DEV), manualStatus: "converted" },
      ...extra,
    ],
    script: {
      name: "Questionnaire",
      questions: [{ key: "has_pos", label: "Caisse en place ?", type: "yes_no" }],
    },
  };
}

async function seed(body: unknown = fullBody()): Promise<DevSeedResult> {
  const response = await postSeed(body);
  expect(response.status).toBe(200);
  return devSeedResultSchema.parse(await response.json());
}

async function tableCounts(): Promise<number[]> {
  const db = getDb(env.DB);
  return Promise.all(
    [prospects, visits, visitsOrphaned, scripts].map(async (table) => {
      const [row] = await db.select({ n: count() }).from(table);
      return row?.n ?? 0;
    }),
  );
}

/** EXPERIENCE.md › Convertis: prospects that became converted in [from, to). */
async function converted(from: number, to: number, agent?: string): Promise<number> {
  const [row] = await getDb(env.DB)
    .select({ n: countDistinct(visits.prospectId) })
    .from(visits)
    .where(
      and(
        eq(visits.outcome, "converted"),
        gte(visits.visitedAt, from),
        lt(visits.visitedAt, to),
        agent === undefined ? undefined : eq(visits.agentEmail, agent),
      ),
    );
  return row?.n ?? 0;
}

describe("POST /api/dev/seed — the dashboard's data", () => {
  it("fills every figure the dashboard and its later stories need", async () => {
    const result = await seed();
    expect(result.seeded).toBe(27);
    expect(result.inserted.prospects).toBe(27);
    expect(result.inserted.visits).toBeGreaterThan(0);
    expect(result.inserted.orphans).toBe(2);

    const now = Date.now();
    for (const period of DASHBOARD_PERIODS) {
      const response = await call(`/api/admin/dashboard?period=${period}`);
      expect(response.status).toBe(200);
      const figures = (await response.json()) as DashboardResponse;
      expect(figures.visits.value, `Visites, ${period} days`).toBeGreaterThan(0);
      expect(figures.visits.previous, `Visites before, ${period} days`).toBeGreaterThan(0);
      expect(figures.visits.delta).not.toBeNull();
      expect(figures.openProspects).toBeGreaterThan(0);

      const { from, to, previousFrom } = brusselsPeriod(now, period);
      expect(await converted(from, to), `Convertis, ${period} days`).toBeGreaterThan(0);
      expect(await converted(previousFrom, from), `Convertis before, ${period}`).toBeGreaterThan(0);
    }

    const db = getDb(env.DB);
    const week = brusselsPeriod(now, 7);
    for (const agent of [DEV, OTHER]) {
      const [visited] = await db
        .select({ n: count() })
        .from(visits)
        .where(
          and(
            eq(visits.agentEmail, agent),
            gte(visits.visitedAt, week.from),
            lt(visits.visitedAt, week.to),
          ),
        );
      expect(visited?.n, `${agent} visits in 7 days`).toBeGreaterThan(0);
      expect(await converted(week.from, week.to, agent)).toBeGreaterThan(0);
    }

    // No visit is dated after now (INVARIANT 12), and each one is its assignee's.
    const [late] = await db.select({ n: count() }).from(visits).where(gt(visits.visitedAt, now));
    expect(late?.n).toBe(0);
    const [stranger] = await db
      .select({ n: count() })
      .from(visits)
      .innerJoin(prospects, eq(prospects.id, visits.prospectId))
      .where(sql`${visits.agentEmail} is not ${prospects.assignedTo}`);
    expect(stranger?.n).toBe(0);

    const live = await db
      .select({ status: prospects.status, n: count() })
      .from(prospects)
      .where(isNull(prospects.mergedInto))
      .groupBy(prospects.status);
    for (const status of STATUSES) {
      expect(live.find((r) => r.status === status)?.n ?? 0, status).toBeGreaterThan(0);
    }

    // Relances dues: follow_up, next_visit_at today or earlier.
    const followUp = and(eq(prospects.status, "follow_up"), isNull(prospects.mergedInto));
    const [due] = await db
      .select({ n: count() })
      .from(prospects)
      .where(and(followUp, lt(prospects.nextVisitAt, brusselsPeriod(now, 1).to)));
    expect(due?.n).toBeGreaterThan(0);
    // Relances dues sous 7 jours.
    const [soon] = await db
      .select({ n: count() })
      .from(prospects)
      .where(
        and(
          followUp,
          gt(prospects.nextVisitAt, now),
          lte(prospects.nextVisitAt, now + 7 * 86_400_000),
        ),
      );
    expect(soon?.n).toBeGreaterThan(0);

    const reasons = await db
      .select({ reason: visitsOrphaned.reason, n: count() })
      .from(visitsOrphaned)
      .groupBy(visitsOrphaned.reason);
    expect(reasons.find((r) => r.reason === "not_assigned")?.n).toBe(1);
    expect(reasons.find((r) => r.reason === "unknown_prospect")?.n).toBe(1);

    const duplicates = (await (
      await call("/api/admin/prospects/duplicates")
    ).json()) as DuplicatesResponse;
    expect(duplicates.pairs.map((p) => [p.a.name, p.b.name].sort())).toContainEqual([
      "Chez Léa",
      "Chez Léa et Paul",
    ]);

    const merged = await db
      .select({ name: prospects.name, mergedInto: prospects.mergedInto })
      .from(prospects)
      .where(isNotNull(prospects.mergedInto));
    const [roma] = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(eq(prospects.name, "Pizza Roma"));
    expect(merged).toEqual([{ name: "Pizzeria Roma", mergedInto: roma?.id }]);

    const manual = await db
      .select({ name: prospects.name, status: prospects.status })
      .from(prospects)
      .where(isNotNull(prospects.statusSetAt));
    expect(manual).toEqual([{ name: "Le Jardin", status: "converted" }]);
  });

  it("inserts nothing on a second run, and touches no prospect", async () => {
    await seed();
    const before = await tableCounts();
    const stamps = () =>
      getDb(env.DB)
        .select({ id: prospects.id, updatedAt: prospects.updatedAt })
        .from(prospects)
        .orderBy(prospects.id);
    const updatedBefore = await stamps();
    const again = await seed();
    expect(again.inserted).toEqual({ prospects: 0, visits: 0, orphans: 0 });
    expect(await tableCounts()).toEqual(before);
    // The admin list orders by updated_at; a no-op re-seed must not reshuffle it.
    expect(await stamps()).toEqual(updatedBefore);
  });

  it("builds a history on the stored row, not the body, when they differ", async () => {
    const body = fullBody();
    const entry = body.prospects[0];
    if (!entry) throw new Error("fullBody has no prospects");
    expect(entry.assignedTo).toBe(DEV);
    // Seeded before ids were hashed, and reassigned by an admin since.
    const storedId = crypto.randomUUID();
    const now = Date.now();
    await getDb(env.DB)
      .insert(prospects)
      .values({
        id: storedId,
        name: entry.name,
        type: entry.type,
        lat: entry.lat,
        lng: entry.lng,
        address: entry.address,
        source: "csv",
        dedupeKey: dedupeKey(entry),
        status: "assigned",
        assignedTo: OTHER,
        createdBy: "seed@localhost",
        createdAt: now,
        updatedAt: now,
      });

    await seed(body);
    const rows = await getDb(env.DB)
      .select({ prospectId: visits.prospectId, agentEmail: visits.agentEmail })
      .from(visits)
      .where(eq(visits.prospectId, storedId));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.agentEmail).toBe(OTHER);
    expect(
      await getDb(env.DB).select().from(prospects).where(eq(prospects.name, entry.name)),
    ).toHaveLength(1);
  });

  it("rejects a merge target that is not in the body, writing nothing", async () => {
    for (const mergeInto of ["Nulle part", "Maison perdue"]) {
      const response = await postSeed(
        fullBody([{ ...place("Maison perdue", 50.99, 4.4, DEV), mergeInto }]),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "validation" });
    }
    expect(await tableCounts()).toEqual([0, 0, 0, 0]);
  });

  it("does not quarantine again a visit an admin has repaired", async () => {
    await seed();
    const db = getDb(env.DB);
    const [orphan] = await db
      .select()
      .from(visitsOrphaned)
      .where(eq(visitsOrphaned.reason, "not_assigned"));
    if (!orphan) throw new Error("the seed quarantined no not_assigned visit");

    const repair = await call(`/api/admin/visits/orphaned/${orphan.id}/repair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId: orphan.prospectId }),
    });
    expect(repair.status).toBe(200);

    const again = await seed();
    expect(again.inserted.orphans).toBe(0);
    expect(
      await db.select().from(visitsOrphaned).where(eq(visitsOrphaned.id, orphan.id)),
    ).toHaveLength(0);
    expect(await db.select().from(visits).where(eq(visits.id, orphan.id))).toHaveLength(1);
  });

  it("leaves a status the admin has since set by hand", async () => {
    await seed();
    const db = getDb(env.DB);
    const [jardin] = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(eq(prospects.name, "Le Jardin"));
    const reopen = await call(`/api/admin/prospects/${jardin?.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "follow_up" }),
    });
    expect(reopen.status).toBe(200);

    await seed();
    const [after] = await db
      .select({ status: prospects.status })
      .from(prospects)
      .where(eq(prospects.name, "Le Jardin"));
    expect(after?.status).toBe("follow_up");
  });
});

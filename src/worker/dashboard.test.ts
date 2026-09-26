import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import { getDb } from "./db/client";
import { eq, sql } from "drizzle-orm";
import { prospects, scripts, visits, visitsOrphaned } from "./db/schema";
import { DASHBOARD_PERIODS, type Outcome, type Status } from "../shared/constants";
import { brusselsPeriod } from "../shared/period";
import type { DashboardResponse } from "../shared/schemas";

/**
 * `GET /api/admin/dashboard` against a real D1 (GH #107).
 *
 * Rows are written straight through Drizzle at instants taken from
 * `brusselsPeriod`, the same function the route counts with — so these tests
 * pin which side of each bound a visit lands on, not the calendar arithmetic,
 * which `period.test.ts` covers.
 */

const ADMIN = "admin@example.com";
const AGENT = "agent@example.com";

async function call(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function dashboard(query = ""): Promise<DashboardResponse> {
  const response = await call(`/api/admin/dashboard${query}`);
  expect(response.status).toBe(200);
  return (await response.json()) as DashboardResponse;
}

async function seedProspect(
  status: Status = "assigned",
  mergedInto: string | null = null,
  statusSetAt: number | null = null,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await getDb(env.DB)
    .insert(prospects)
    .values({
      id,
      name: "Le Bistrot",
      type: "restaurant",
      source: "csv",
      dedupeKey: `test:${id}`,
      status,
      assignedTo: AGENT,
      mergedInto,
      statusSetAt,
      createdBy: ADMIN,
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

async function seedVisits(
  prospectId: string,
  visitedAts: number[],
  outcome: Outcome = "interested",
): Promise<void> {
  if (visitedAts.length === 0) return;
  const db = getDb(env.DB);
  // Keep last_visit_at as deriveProspectStatus would, since the manual branch
  // of Convertis reads it.
  const latest = Math.max(...visitedAts);
  await db
    .update(prospects)
    .set({ lastVisitAt: sql`max(coalesce(${prospects.lastVisitAt}, ${latest}), ${latest})` })
    .where(eq(prospects.id, prospectId));
  await db.insert(visits).values(
    visitedAts.map((visitedAt) => ({
      id: crypto.randomUUID(),
      prospectId,
      agentEmail: AGENT,
      visitedAt,
      clientVisitedAt: visitedAt,
      receivedAt: visitedAt,
      outcome,
      clientVersion: 1,
    })),
  );
}

beforeEach(async () => {
  const db = getDb(env.DB);
  // Order matters: visits reference prospects by foreign key.
  await db.delete(visits);
  await db.delete(visitsOrphaned);
  await db.delete(prospects);
  await db.delete(scripts);
});

describe("GET /api/admin/dashboard", () => {
  it.each(DASHBOARD_PERIODS)(
    "counts period %i and its previous period at the exact bounds (I/O matrix, boundary)",
    async (period) => {
      const { from, to, previousFrom } = brusselsPeriod(Date.now(), period);
      const prospectId = await seedProspect();
      await seedVisits(prospectId, [
        // Current: [from, to)
        from,
        from + 1,
        to - 1,
        // Previous: [previousFrom, from)
        from - 1,
        previousFrom,
        // Neither
        previousFrom - 1,
        to,
      ]);

      const body = await dashboard(`?period=${period}`);
      expect(body.period).toBe(period);
      expect(body.from).toBe(from);
      expect(body.to).toBe(to);
      expect(body.visits).toEqual({ value: 3, previous: 2, delta: 0.5 });
    },
  );

  it("defaults to 30 days (I/O matrix, default period)", async () => {
    const body = await dashboard();
    expect(body.period).toBe(30);
    expect(body.from).toBe(brusselsPeriod(Date.now(), 30).from);
  });

  it("has a null delta when the previous period is empty (I/O matrix, previous empty)", async () => {
    const { from } = brusselsPeriod(Date.now(), 7);
    await seedVisits(await seedProspect(), [from, from + 1]);

    const body = await dashboard("?period=7");
    expect(body.visits).toEqual({ value: 2, previous: 0, delta: null });
  });

  it("has a delta of 0 when flat (I/O matrix, flat)", async () => {
    const { from } = brusselsPeriod(Date.now(), 7);
    await seedVisits(await seedProspect(), [from, from - 1]);

    const body = await dashboard("?period=7");
    expect(body.visits).toEqual({ value: 1, previous: 1, delta: 0 });
  });

  it("counts a merged prospect's visits and leaves quarantined ones out", async () => {
    const { from } = brusselsPeriod(Date.now(), 30);
    const survivor = await seedProspect();
    const absorbed = await seedProspect("assigned", survivor);
    await seedVisits(survivor, [from]);
    await seedVisits(absorbed, [from + 1]);
    await getDb(env.DB)
      .insert(visitsOrphaned)
      .values({
        id: crypto.randomUUID(),
        prospectId: crypto.randomUUID(),
        agentEmail: AGENT,
        visitedAt: from + 2,
        clientVisitedAt: from + 2,
        receivedAt: from + 2,
        outcome: "converted",
        clientVersion: 1,
        reason: "unknown_prospect",
        quarantinedAt: from + 2,
      });

    const body = await dashboard("?period=30");
    expect(body.visits.value).toBe(2);
    // The quarantined visit is `converted`, and still not a conversion.
    expect(body.converted.value).toBe(0);
  });

  it("counts open, live prospects as a snapshot the period does not move (I/O matrix, snapshot)", async () => {
    const survivor = await seedProspect("new");
    await seedProspect("assigned");
    await seedProspect("follow_up");
    // Not open.
    await seedProspect("converted");
    await seedProspect("rejected");
    // Open, but merged away: not a prospect the admin has any more.
    await seedProspect("new", survivor);

    const counts = [];
    for (const period of DASHBOARD_PERIODS) {
      counts.push((await dashboard(`?period=${period}`)).openProspects);
    }
    expect(counts).toEqual([3, 3, 3]);
  });

  it.each(["14", "abc", "", "30.5"])(
    "answers 400 for period=%s (I/O matrix, bad period)",
    async (value) => {
      const response = await call(`/api/admin/dashboard?period=${value}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "validation" });
    },
  );

  it("answers 403 to an agent (I/O matrix, agent caller)", async () => {
    const saved = env.DEV_USER_EMAIL;
    try {
      env.DEV_USER_EMAIL = AGENT;
      expect((await call("/api/admin/dashboard")).status).toBe(403);
    } finally {
      env.DEV_USER_EMAIL = saved;
    }
  });
});

describe("GET /api/admin/dashboard › Convertis and Taux de conversion", () => {
  it.each(DASHBOARD_PERIODS)(
    "counts a converted visit at from, period %i (I/O matrix, by visit)",
    async (period) => {
      const { from } = brusselsPeriod(Date.now(), period);
      await seedVisits(await seedProspect("converted"), [from], "converted");

      const body = await dashboard(`?period=${period}`);
      expect(body.converted).toEqual({ value: 1, previous: 0, delta: null });
      expect(body.conversionRate).toEqual({
        value: 1,
        previous: null,
        delta: null,
        visitedProspects: { value: 1, previous: 0 },
      });
    },
  );

  it.each(DASHBOARD_PERIODS)(
    "counts a manual conversion but not in the denominator, period %i (I/O matrix, manually)",
    async (period) => {
      const { from } = brusselsPeriod(Date.now(), period);
      await seedProspect("converted", null, from);

      const body = await dashboard(`?period=${period}`);
      expect(body.converted.value).toBe(1);
      expect(body.conversionRate.visitedProspects.value).toBe(0);
      expect(body.conversionRate.value).toBeNull();
    },
  );

  it.each(DASHBOARD_PERIODS)(
    "counts a prospect once however often it converts, period %i (I/O matrix, twice)",
    async (period) => {
      const { from } = brusselsPeriod(Date.now(), period);
      const twiceByVisit = await seedProspect("converted");
      await seedVisits(twiceByVisit, [from, from + 1], "converted");
      const visitAndManual = await seedProspect("converted", null, from + 2);
      await seedVisits(visitAndManual, [from + 1], "converted");

      const body = await dashboard(`?period=${period}`);
      expect(body.converted.value).toBe(2);
      expect(body.conversionRate.visitedProspects.value).toBe(2);
      expect(body.conversionRate.value).toBe(1);
    },
  );

  it.each(DASHBOARD_PERIODS)(
    "puts a conversion on the right side of each bound, period %i (I/O matrix, boundaries)",
    async (period) => {
      const { from, to, previousFrom } = brusselsPeriod(Date.now(), period);
      // Current: [from, to)
      await seedVisits(await seedProspect("converted"), [to - 1], "converted");
      await seedProspect("converted", null, to - 1);
      // Previous: [previousFrom, from)
      await seedVisits(await seedProspect("converted"), [from - 1], "converted");
      await seedProspect("converted", null, from - 1);
      await seedVisits(await seedProspect("converted"), [previousFrom], "converted");
      await seedProspect("converted", null, previousFrom);
      // Neither
      await seedVisits(await seedProspect("converted"), [to], "converted");
      await seedProspect("converted", null, to);
      await seedVisits(await seedProspect("converted"), [previousFrom - 1], "converted");
      await seedProspect("converted", null, previousFrom - 1);

      const body = await dashboard(`?period=${period}`);
      expect(body.converted).toEqual({ value: 2, previous: 4, delta: -0.5 });
      expect(body.conversionRate.visitedProspects).toEqual({ value: 1, previous: 2 });
    },
  );

  it("does not count a manual conversion a later visit overrode (I/O matrix, manual, overridden)", async () => {
    const { from } = brusselsPeriod(Date.now(), 30);
    // Converted by hand at from, then a follow_up visit moved the status on.
    const prospectId = await seedProspect("follow_up", null, from);
    await seedVisits(prospectId, [from + 1], "follow_up");

    const body = await dashboard("?period=30");
    expect(body.converted.value).toBe(0);
    expect(body.conversionRate.value).toBe(0);
  });

  it.each(DASHBOARD_PERIODS)(
    "does not take a visit's conversion for an earlier manual one, period %i",
    async (period) => {
      const { from } = brusselsPeriod(Date.now(), period);
      // An admin set follow_up by hand at from − 1; a converted visit at from
      // then set the status and left status_set_at where it was.
      const prospectId = await seedProspect("converted", null, from - 1);
      await seedVisits(prospectId, [from], "converted");

      const body = await dashboard(`?period=${period}`);
      expect(body.converted).toEqual({ value: 1, previous: 0, delta: null });
    },
  );

  it("has a null rate and no delta when nothing was visited (I/O matrix, no visits)", async () => {
    const body = await dashboard("?period=30");
    expect(body.converted).toEqual({ value: 0, previous: 0, delta: null });
    expect(body.conversionRate).toEqual({
      value: null,
      previous: null,
      delta: null,
      visitedProspects: { value: 0, previous: 0 },
    });
  });

  it.each(DASHBOARD_PERIODS)(
    "divides Convertis by prospects visited and deltas in points, period %i (I/O matrix, rate)",
    async (period) => {
      const { from } = brusselsPeriod(Date.now(), period);
      // Current: 2 converted of 8 visited.
      for (let i = 0; i < 8; i++) {
        await seedVisits(await seedProspect(), [from + i], i < 2 ? "converted" : "interested");
      }
      // Previous: 1 converted of 5 visited.
      for (let i = 0; i < 5; i++) {
        await seedVisits(await seedProspect(), [from - 1 - i], i < 1 ? "converted" : "no_contact");
      }

      const body = await dashboard(`?period=${period}`);
      expect(body.converted).toEqual({ value: 2, previous: 1, delta: 1 });
      expect(body.conversionRate.value).toBe(0.25);
      expect(body.conversionRate.previous).toBe(0.2);
      expect(body.conversionRate.delta).toBeCloseTo(0.05, 12);
      expect(body.conversionRate.visitedProspects).toEqual({ value: 8, previous: 5 });
    },
  );

  it.each(DASHBOARD_PERIODS)(
    "counts an absorbed prospect as its survivor, period %i (I/O matrix, merged)",
    async (period) => {
      const { from } = brusselsPeriod(Date.now(), period);
      const survivor = await seedProspect("converted");
      const absorbed = await seedProspect("converted", survivor);
      await seedVisits(survivor, [from], "converted");
      await seedVisits(absorbed, [from + 1], "converted");

      const body = await dashboard(`?period=${period}`);
      expect(body.converted.value).toBe(1);
      expect(body.conversionRate.visitedProspects.value).toBe(1);
      // Visites still counts both: they both happened.
      expect(body.visits.value).toBe(2);
    },
  );

  it.each(DASHBOARD_PERIODS)(
    "counts an absorbed prospect's manual conversion as its survivor, period %i",
    async (period) => {
      const { from } = brusselsPeriod(Date.now(), period);
      const survivor = await seedProspect();
      await seedProspect("converted", survivor, from + 1);

      expect((await dashboard(`?period=${period}`)).converted.value).toBe(1);

      // The survivor converting by visit too is still the one place.
      await seedVisits(survivor, [from], "converted");
      expect((await dashboard(`?period=${period}`)).converted.value).toBe(1);
    },
  );

  it("still counts a conversion reopened later in the period (I/O matrix, reopened)", async () => {
    const { from } = brusselsPeriod(Date.now(), 30);
    const prospectId = await seedProspect("follow_up");
    await seedVisits(prospectId, [from], "converted");
    await seedVisits(prospectId, [from + 1], "follow_up");

    const body = await dashboard("?period=30");
    expect(body.converted.value).toBe(1);
    expect(body.conversionRate.value).toBe(1);
  });
});

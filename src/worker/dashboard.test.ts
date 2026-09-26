import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import { getDb } from "./db/client";
import { prospects, scripts, visits, visitsOrphaned } from "./db/schema";
import { DASHBOARD_PERIODS, type Status } from "../shared/constants";
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
      createdBy: ADMIN,
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

async function seedVisits(prospectId: string, visitedAts: number[]): Promise<void> {
  if (visitedAts.length === 0) return;
  await getDb(env.DB)
    .insert(visits)
    .values(
      visitedAts.map((visitedAt) => ({
        id: crypto.randomUUID(),
        prospectId,
        agentEmail: AGENT,
        visitedAt,
        clientVisitedAt: visitedAt,
        receivedAt: visitedAt,
        outcome: "interested" as const,
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

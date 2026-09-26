import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * Indexes that exist for a query plan rather than a constraint, so nothing
 * else fails when one goes missing or stops being picked.
 */

interface PlanRow {
  detail: string;
}

async function planOf(sql: string, ...params: number[]): Promise<string[]> {
  const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...params)
    .all<PlanRow>();
  return results.map((row) => row.detail);
}

describe("visits(visited_at)", () => {
  // The dashboard counts visits over up to 180 days by visited_at; a table scan
  // there would not fit the 10 ms CPU budget (server-gaps G2, INVARIANT 13).
  it("serves a visited_at range count", async () => {
    const plan = await planOf(
      "SELECT count(*) FROM visits WHERE visited_at >= ?1 AND visited_at < ?2",
      Date.UTC(2026, 2, 1),
      Date.UTC(2026, 8, 1),
    );

    expect(plan.some((detail) => detail.includes("visits_visited_idx"))).toBe(true);
    expect(plan.some((detail) => detail.startsWith("SCAN visits"))).toBe(false);
  });
});

describe("Convertis' statement", () => {
  // The shape of conversionCounts in routes/admin.ts: a visited_at range joined
  // to prospects, UNION ALL the manual conversions read by status.
  it("serves both branches from an index", async () => {
    const plan = await planOf(
      `SELECT count(DISTINCT prospect_key) FROM (
        SELECT coalesce(prospects.merged_into, prospects.id) AS prospect_key,
               visits.visited_at >= ?2 AS in_current
        FROM visits INNER JOIN prospects ON prospects.id = visits.prospect_id
        WHERE visits.visited_at >= ?1 AND visits.visited_at < ?3
        UNION ALL
        SELECT coalesce(merged_into, id), status_set_at >= ?2
        FROM prospects
        WHERE status = 'converted' AND status_set_at >= ?1 AND status_set_at < ?3
          AND (last_visit_at IS NULL OR last_visit_at <= status_set_at)
      )`,
      Date.UTC(2026, 2, 1),
      Date.UTC(2026, 5, 1),
      Date.UTC(2026, 8, 1),
    );

    expect(plan.some((detail) => detail.includes("visits_visited_idx"))).toBe(true);
    expect(plan.some((detail) => detail.includes("prospects_status_idx"))).toBe(true);
    expect(plan.some((detail) => detail.startsWith("SCAN visits"))).toBe(false);
    expect(plan.some((detail) => detail.startsWith("SCAN prospects"))).toBe(false);
  });
});

describe("Visites dans le temps' statement", () => {
  // The shape of visitsByDay in routes/admin.ts: a visited_at range grouped by
  // Brussels day and outcome (GH #110).
  it("serves the range from visits_visited_idx", async () => {
    const plan = await planOf(
      `SELECT cast((visited_at + CASE WHEN visited_at >= ?3 THEN ?4 ELSE ?5 END) / ?6 AS integer) - ?7 AS day,
              outcome, count(*)
       FROM visits
       WHERE visited_at >= ?1 AND visited_at < ?2
       GROUP BY day, outcome`,
      Date.UTC(2026, 2, 1),
      Date.UTC(2026, 5, 1),
      Date.UTC(2026, 2, 29, 1),
      7_200_000,
      3_600_000,
      86_400_000,
      20_513,
    );

    expect(plan.some((detail) => detail.includes("visits_visited_idx"))).toBe(true);
    expect(plan.some((detail) => detail.startsWith("SCAN visits"))).toBe(false);
  });
});

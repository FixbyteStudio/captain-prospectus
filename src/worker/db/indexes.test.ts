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

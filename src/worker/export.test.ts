import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import { boundParamsPerRow, getDb } from "./db/client";
import { chunk } from "../shared/chunk";
import { prospects, scripts, visits, visitsOrphaned } from "./db/schema";
import { CSV_ATTRIBUTION } from "../shared/csv";
import { EXPORT_ROWS } from "../shared/constants";

/**
 * CSV exports — docs/backlog/001 and 002.
 *
 * The reader is a spreadsheet, so the things worth pinning are the ones a
 * spreadsheet gets wrong: escaping, ISO timestamps, and the attribution line.
 */

const ADMIN = "admin@example.com";
const AGENT = "agent@example.com";

async function call(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function seedProspect(over: Partial<Record<string, unknown>> = {}): Promise<string> {
  const db = getDb(env.DB);
  const id = crypto.randomUUID();
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
    createdBy: ADMIN,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  });
  return id;
}

async function seedVisit(prospectId: string, over: Partial<Record<string, unknown>> = {}) {
  const db = getDb(env.DB);
  const now = Date.now();
  await db.insert(visits).values({
    id: crypto.randomUUID(),
    prospectId,
    agentEmail: AGENT,
    visitedAt: now,
    clientVisitedAt: now,
    receivedAt: now,
    lat: null,
    lng: null,
    flyerGiven: true,
    outcome: "interested",
    followUpAt: null,
    notes: null,
    scriptId: null,
    answers: {},
    clientVersion: 1,
    ...over,
  });
}

/** Splits on record boundaries, respecting quoted newlines. */
function records(csv: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "\r" && csv[i + 1] === "\n") {
      out.push(current);
      current = "";
      i++;
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

beforeEach(async () => {
  const db = getDb(env.DB);
  await db.delete(visits);
  await db.delete(visitsOrphaned);
  await db.delete(prospects);
  await db.delete(scripts);
});

describe("GET /api/admin/prospects/export.csv", () => {
  it("answers a CSV attachment with the agreed header and the attribution", async () => {
    await seedProspect();
    const response = await call("/api/admin/prospects/export.csv");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="prospects-\d{4}-\d{2}-\d{2}\.csv"$/,
    );

    const rows = records(await response.text());
    expect(rows[0]).toBe(
      "name,type,address,phone,website,cuisine,status,assigned_to,source,lat,lng,last_visit_at,next_visit_at",
    );
    // INVARIANT 11 / architecture.md invariant 9.
    expect(rows.at(-1)).toBe(CSV_ATTRIBUTION);
  });

  it("is header and attribution only when nothing matches", async () => {
    const rows = records(await (await call("/api/admin/prospects/export.csv")).text());
    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe(CSV_ATTRIBUTION);
  });

  it("filters exactly as the list screen does", async () => {
    await seedProspect({ name: "Gardé", status: "converted" });
    await seedProspect({ name: "Filtré", status: "new" });

    const body = await (await call("/api/admin/prospects/export.csv?status=converted")).text();
    expect(body).toContain("Gardé");
    expect(body).not.toContain("Filtré");
  });

  it("excludes a merged prospect, like every other list", async () => {
    const survivor = await seedProspect({ name: "Survivant" });
    await seedProspect({ name: "Absorbé", mergedInto: survivor });

    const body = await (await call("/api/admin/prospects/export.csv")).text();
    expect(body).toContain("Survivant");
    expect(body).not.toContain("Absorbé");
  });

  it("writes timestamps as ISO-8601 and nulls as empty fields", async () => {
    await seedProspect({ lastVisitAt: 1_700_000_000_000, address: null });
    const rows = records(await (await call("/api/admin/prospects/export.csv")).text());

    expect(rows[1]).toContain("2023-11-14T22:13:20.000Z");
    expect(rows[1]).not.toContain("null");
  });

  it("caps the file and says so", async () => {
    const db = getDb(env.DB);
    const now = Date.now();
    const rows = Array.from({ length: EXPORT_ROWS + 20 }, (_, i) => {
      const id = crypto.randomUUID();
      return {
        id,
        name: `P${i}`,
        type: "restaurant" as const,
        lat: null,
        lng: null,
        address: null,
        phone: null,
        website: null,
        cuisine: null,
        source: "csv" as const,
        sourceRef: null,
        dedupeKey: `bulk:${id}`,
        status: "new" as const,
        assignedTo: null,
        createdBy: ADMIN,
        createdAt: now,
        updatedAt: now,
      };
    });
    // INVARIANT 7 applies to a test seeder too: D1 takes at most 100 bound
    // parameters per statement.
    for (const batch of chunk(rows, boundParamsPerRow(prospects))) {
      await db.insert(prospects).values(batch);
    }

    const response = await call("/api/admin/prospects/export.csv");
    expect(response.headers.get("x-truncated")).toBe("true");
    // header + EXPORT_ROWS + attribution
    expect(records(await response.text())).toHaveLength(EXPORT_ROWS + 2);
  });

  it("is refused to an agent", async () => {
    const saved = env.DEV_USER_EMAIL;
    try {
      env.DEV_USER_EMAIL = AGENT;
      expect((await call("/api/admin/prospects/export.csv")).status).toBe(403);
    } finally {
      env.DEV_USER_EMAIL = saved;
    }
  });
});

describe("GET /api/admin/visits/export.csv", () => {
  it("answers a CSV attachment with the agreed header", async () => {
    const id = await seedProspect();
    await seedVisit(id);

    const response = await call("/api/admin/visits/export.csv");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/filename="visits-/);

    const rows = records(await response.text());
    expect(rows[0]).toBe(
      "visited_at,received_at,agent_email,prospect_name,outcome,flyer_given,follow_up_at,notes",
    );
    expect(rows[1]).toContain("Le Bistrot");
  });

  /**
   * A note written outdoors carries all three hazards. If escaping is wrong the
   * file gains a record, so counting records is the assertion that matters.
   */
  it("keeps a note with a newline, a comma and a quote inside one record", async () => {
    const id = await seedProspect();
    await seedVisit(id, { notes: 'il a dit « non, merci »\nrappeler en "septembre"' });

    const rows = records(await (await call("/api/admin/visits/export.csv")).text());
    // header + one visit + attribution, and nothing split in two.
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain('""septembre""');
  });

  /** INVARIANT 12: a phone can sync days late, so the range reads the server clock. */
  it("filters on received_at, not visited_at", async () => {
    const id = await seedProspect();
    const now = Date.now();
    await seedVisit(id, {
      // Visited a month ago, but it only reached the server just now.
      visitedAt: now - 30 * 24 * 60 * 60 * 1000,
      receivedAt: now,
      notes: "sync tardive",
    });

    const body = await (
      await call(`/api/admin/visits/export.csv?from=${now - 60_000}&to=${now + 60_000}`)
    ).text();
    expect(body).toContain("sync tardive");
  });

  it("refuses a reversed range with 400 rather than an empty file", async () => {
    const now = Date.now();
    const response = await call(`/api/admin/visits/export.csv?from=${now}&to=${now - 1000}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "validation" });
  });

  it("is refused to an agent", async () => {
    const saved = env.DEV_USER_EMAIL;
    try {
      env.DEV_USER_EMAIL = AGENT;
      expect((await call("/api/admin/visits/export.csv")).status).toBe(403);
    } finally {
      env.DEV_USER_EMAIL = saved;
    }
  });
});

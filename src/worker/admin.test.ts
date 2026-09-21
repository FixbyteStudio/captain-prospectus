import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { prospects, visits } from "./db/schema";
import type {
  AgentsResponse,
  AssignResult,
  ImportResult,
  Prospect,
  ProspectsResponse,
} from "../shared/schemas";

/**
 * Admin routes against a real D1, built by the real migrations.
 *
 * DEV_USER_EMAIL is bound in vitest.config.ts to an address that ADMIN_EMAILS
 * also lists, so these run as an admin exactly as localhost development does.
 */

const ADMIN = "admin@example.com";
const AGENT = "agent@example.com";

async function call(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function post(path: string, body: unknown): Promise<Response> {
  return call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown): Promise<Response> {
  return call(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type Row = {
  name: string;
  type?: string;
  lat?: number;
  lng?: number;
  address?: string;
  phone?: string;
  sourceRef?: string;
};

function importRows(rows: Row[], source: "csv" | "osm" = "csv"): Promise<Response> {
  return post("/api/admin/prospects/batch", { source, rows });
}

beforeEach(async () => {
  const db = getDb(env.DB);
  await db.delete(visits);
  await db.delete(prospects);
});

describe("GET /api/admin/agents", () => {
  it("lists the admins and the agents, with their roles", async () => {
    const response = await call("/api/admin/agents");
    expect(response.status).toBe(200);

    const body = (await response.json()) as AgentsResponse;
    expect(body.agents).toEqual([
      { email: ADMIN, role: "admin" },
      { email: AGENT, role: "agent" },
    ]);
  });
});

describe("GET /api/admin/prospects", () => {
  it("returns an empty list rather than an error when nothing is imported", async () => {
    const body = (await (await call("/api/admin/prospects")).json()) as ProspectsResponse;
    expect(body).toEqual({ prospects: [], total: 0 });
  });

  it("filters by status, assignee and source", async () => {
    await importRows([{ name: "Chez Léa", lat: 45.75, lng: 4.83 }]);
    await importRows([{ name: "Le Zinc", lat: 45.76, lng: 4.84 }], "osm");

    const db = getDb(env.DB);
    const [first] = await db.select().from(prospects).limit(1);
    if (!first) throw new Error("the import wrote nothing");
    await post("/api/admin/prospects/assign", { ids: [first.id], assignedTo: AGENT });

    const byStatus = (await (
      await call("/api/admin/prospects?status=assigned")
    ).json()) as ProspectsResponse;
    expect(byStatus.prospects.map((p) => p.id)).toEqual([first.id]);

    const byAgent = (await (
      await call(`/api/admin/prospects?assignedTo=${AGENT}`)
    ).json()) as ProspectsResponse;
    expect(byAgent.prospects.map((p) => p.id)).toEqual([first.id]);

    const bySource = (await (
      await call("/api/admin/prospects?source=osm")
    ).json()) as ProspectsResponse;
    expect(bySource.prospects.map((p) => p.name)).toEqual(["Le Zinc"]);
  });

  it("pages, and reports the total matching the filter rather than the page", async () => {
    await importRows(
      Array.from({ length: 12 }, (_, i) => ({
        name: `Bistrot ${i}`,
        lat: 45.7 + i / 100,
        lng: 4.8,
      })),
    );

    const page = (await (
      await call("/api/admin/prospects?limit=5&offset=0")
    ).json()) as ProspectsResponse;
    expect(page.prospects).toHaveLength(5);
    expect(page.total).toBe(12);

    const rest = (await (
      await call("/api/admin/prospects?limit=5&offset=10")
    ).json()) as ProspectsResponse;
    expect(rest.prospects).toHaveLength(2);
    expect(rest.total).toBe(12);
  });

  it("rejects a filter value that is not a known status", async () => {
    const response = await call("/api/admin/prospects?status=parti");
    expect(response.status).toBe(400);
  });
});

describe("POST /api/admin/prospects/batch", () => {
  it("rejects a row without a name", async () => {
    const response = await importRows([{ name: "" }]);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("validation");
  });

  it("imports rows and reports what it created", async () => {
    const response = await importRows([
      { name: "Chez Léa", lat: 45.75, lng: 4.83, type: "restaurant" },
      { name: "Le Zinc", lat: 45.76, lng: 4.84, type: "bar" },
    ]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual<ImportResult>({ created: 2, updated: 0 });
    expect(await getDb(env.DB).select().from(prospects)).toHaveLength(2);
  });

  it("accepts a row with no coordinates", async () => {
    // ingestion.md: allowed on purpose. It appears on the agent's list without
    // distance ordering rather than being rejected at the door.
    const response = await importRows([{ name: "La Cantine Mobile" }]);
    expect(await response.json()).toEqual<ImportResult>({ created: 1, updated: 0 });
  });

  it("collapses two rows of the same place inside one request", async () => {
    // SQLite refuses an ON CONFLICT DO UPDATE that touches a row twice in one
    // statement, so a spreadsheet listing a place twice must not reach D1 twice.
    const response = await importRows([
      { name: "Chez Léa", lat: 45.75, lng: 4.83 },
      { name: "chez lea", lat: 45.7501, lng: 4.8301 },
    ]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual<ImportResult>({ created: 1, updated: 0 });
    expect(await getDb(env.DB).select().from(prospects)).toHaveLength(1);
  });

  it("updates descriptive fields on re-import and never the status or assignment", async () => {
    // The test that matters: this is what the spreadsheet workflow cannot do.
    await importRows([{ name: "Chez Léa", lat: 45.75, lng: 4.83 }]);

    const db = getDb(env.DB);
    const [before] = await db.select().from(prospects);
    if (!before) throw new Error("the import wrote nothing");

    await post("/api/admin/prospects/assign", { ids: [before.id], assignedTo: AGENT });
    await db
      .update(prospects)
      .set({ status: "converted", lastVisitAt: 1_700_000_000_000 })
      .where(eqId(before.id));

    const again = await importRows([
      { name: "Chez Léa", lat: 45.75, lng: 4.83, address: "4 place Bellecour" },
    ]);
    expect(await again.json()).toEqual<ImportResult>({ created: 0, updated: 1 });

    const [after] = await db.select().from(prospects);
    expect(after?.address).toBe("4 place Bellecour");
    // Untouched, all of it.
    expect(after?.id).toBe(before.id);
    expect(after?.status).toBe("converted");
    expect(after?.assignedTo).toBe(AGENT);
    expect(after?.lastVisitAt).toBe(1_700_000_000_000);
  });

  it("leaves a field alone when the import carries no value for it", async () => {
    // The column-mapping step makes "forgot to map the phone column" a
    // one-click mistake. It must not erase every phone number we hold.
    await importRows([{ name: "Chez Léa", lat: 45.75, lng: 4.83, phone: "0478111111" }]);

    const again = await importRows([
      { name: "Chez Léa", lat: 45.75, lng: 4.83, address: "4 place Bellecour" },
    ]);
    expect(await again.json()).toEqual<ImportResult>({ created: 0, updated: 1 });

    const [after] = await getDb(env.DB).select().from(prospects);
    expect(after?.address).toBe("4 place Bellecour");
    expect(after?.phone).toBe("0478111111");
  });

  it("treats a renamed row as a new prospect, not an update", async () => {
    // KNOWN LIMIT, pinned here so it cannot change by accident.
    //
    // The geo: and addr: tiers of the dedupe key are built from the name
    // (prospecting.md), so correcting a spelling in the spreadsheet produces a
    // second prospect rather than updating the first. Only the ref: tier — a
    // source that supplies a stable id, such as OSM — survives a rename.
    // Manual merge is the escape hatch, on the roadmap for M5.
    await importRows([{ name: "Chez Léa", lat: 45.75, lng: 4.83 }]);
    const renamed = await importRows([{ name: "Chez Léa et Paul", lat: 45.75, lng: 4.83 }]);

    expect(await renamed.json()).toEqual<ImportResult>({ created: 1, updated: 0 });
    expect(await getDb(env.DB).select().from(prospects)).toHaveLength(2);
  });

  it("updates through a rename when the source supplies a stable id", async () => {
    await importRows([{ name: "Chez Léa", lat: 45.75, lng: 4.83, sourceRef: "node/123" }], "osm");
    const renamed = await importRows(
      [{ name: "Chez Léa et Paul", lat: 45.75, lng: 4.83, sourceRef: "node/123" }],
      "osm",
    );

    expect(await renamed.json()).toEqual<ImportResult>({ created: 0, updated: 1 });
    const [after] = await getDb(env.DB).select().from(prospects);
    expect(after?.name).toBe("Chez Léa et Paul");
  });

  it("writes more rows than fit in one D1 statement", async () => {
    // INVARIANT 7: prospects binds 19 parameters a row, so 5 rows fill a
    // statement and 120 needs a couple of dozen of them.
    const rows = Array.from({ length: 120 }, (_, i) => ({
      name: `Bistrot ${i}`,
      lat: 45.7 + i / 1000,
      lng: 4.8,
    }));

    const response = await importRows(rows);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual<ImportResult>({ created: 120, updated: 0 });
    expect(await getDb(env.DB).select().from(prospects)).toHaveLength(120);
  });
});

describe("PATCH /api/admin/prospects/:id", () => {
  it("edits a prospect and leaves its dedupe key alone", async () => {
    await importRows([{ name: "Chez Léa", lat: 45.75, lng: 4.83 }]);
    const db = getDb(env.DB);
    const [row] = await db.select().from(prospects);
    if (!row) throw new Error("the import wrote nothing");

    const response = await patch(`/api/admin/prospects/${row.id}`, {
      name: "Chez Léa et Paul",
      phone: "0478000000",
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as Prospect).name).toBe("Chez Léa et Paul");

    const [after] = await db.select().from(prospects);
    // The key is import-time identity. Recomputing it here could collide with
    // the unique index and fail an edit that is perfectly valid.
    expect(after?.dedupeKey).toBe(row.dedupeKey);
  });

  it("lets an admin reopen a prospect by hand", async () => {
    // prospecting.md: rare and deliberate, and the only way a status is sent
    // by a client. INVARIANT 3 is about statuses *derived from a visit*.
    await importRows([{ name: "Le Zinc", lat: 45.76, lng: 4.84 }]);
    const db = getDb(env.DB);
    const [row] = await db.select().from(prospects);
    if (!row) throw new Error("the import wrote nothing");

    await patch(`/api/admin/prospects/${row.id}`, { status: "rejected" });
    const response = await patch(`/api/admin/prospects/${row.id}`, { status: "assigned" });

    expect(response.status).toBe(200);
    expect(((await response.json()) as Prospect).status).toBe("assigned");
  });

  it("answers 404 for an id that does not exist", async () => {
    const response = await patch(`/api/admin/prospects/${crypto.randomUUID()}`, { name: "X" });
    expect(response.status).toBe(404);
  });

  it("answers 400, not 404, when the id is not a UUID", async () => {
    const response = await patch("/api/admin/prospects/not-a-uuid", { name: "X" });
    expect(response.status).toBe(400);
  });

  it("rejects an empty patch", async () => {
    const response = await patch(`/api/admin/prospects/${crypto.randomUUID()}`, {});
    expect(response.status).toBe(400);
  });
});

describe("POST /api/admin/prospects/assign", () => {
  it("assigns in bulk and moves only new prospects to assigned", async () => {
    await importRows([
      { name: "Chez Léa", lat: 45.75, lng: 4.83 },
      { name: "Le Zinc", lat: 45.76, lng: 4.84 },
    ]);

    const db = getDb(env.DB);
    const rows = await db.select().from(prospects);
    const converted = rows[0];
    if (!converted) throw new Error("the import wrote nothing");
    await db.update(prospects).set({ status: "converted" }).where(eqId(converted.id));

    const response = await post("/api/admin/prospects/assign", {
      ids: rows.map((r) => r.id),
      assignedTo: AGENT,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual<AssignResult>({ assigned: 2 });

    const after = await db.select().from(prospects);
    expect(after.every((r) => r.assignedTo === AGENT)).toBe(true);
    // A prospect that has been visited keeps the status its visits earned.
    expect(after.find((r) => r.id === converted.id)?.status).toBe("converted");
    expect(after.find((r) => r.id !== converted.id)?.status).toBe("assigned");
  });

  it("unassigns with a null assignee and returns assigned prospects to new", async () => {
    await importRows([{ name: "Chez Léa", lat: 45.75, lng: 4.83 }]);
    const db = getDb(env.DB);
    const [row] = await db.select().from(prospects);
    if (!row) throw new Error("the import wrote nothing");

    await post("/api/admin/prospects/assign", { ids: [row.id], assignedTo: AGENT });
    await post("/api/admin/prospects/assign", { ids: [row.id], assignedTo: null });

    const [after] = await db.select().from(prospects);
    expect(after?.assignedTo).toBeNull();
    expect(after?.status).toBe("new");
  });

  it("assigns more ids than fit in one D1 statement", async () => {
    // INVARIANT 7: assignSchema allows 500 ids and inArray binds one each, so
    // this has to be chunked or D1 rejects the statement outright.
    await importRows(
      Array.from({ length: 150 }, (_, i) => ({
        name: `Bistrot ${i}`,
        lat: 45.7 + i / 1000,
        lng: 4.8,
      })),
    );

    const db = getDb(env.DB);
    const ids = (await db.select({ id: prospects.id }).from(prospects)).map((r) => r.id);
    expect(ids).toHaveLength(150);

    const response = await post("/api/admin/prospects/assign", { ids, assignedTo: AGENT });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual<AssignResult>({ assigned: 150 });

    const after = await db.select().from(prospects);
    expect(after.every((r) => r.assignedTo === AGENT && r.status === "assigned")).toBe(true);
  });

  it("refuses an assignee who is not on the roster", async () => {
    // A typo here is silent data loss in slow motion: the sync pull matches on
    // the exact email, so the prospect vanishes from every agent's list while
    // the admin list still shows it as assigned and handled.
    await importRows([{ name: "Chez Léa", lat: 45.75, lng: 4.83 }]);
    const db = getDb(env.DB);
    const [row] = await db.select().from(prospects);
    if (!row) throw new Error("the import wrote nothing");

    const response = await post("/api/admin/prospects/assign", {
      ids: [row.id],
      assignedTo: "agnet@example.com",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("unknown_assignee");

    const [after] = await db.select().from(prospects);
    expect(after?.assignedTo).toBeNull();
  });

  it("refuses an unknown assignee through PATCH too", async () => {
    await importRows([{ name: "Chez Léa", lat: 45.75, lng: 4.83 }]);
    const [row] = await getDb(env.DB).select().from(prospects);
    if (!row) throw new Error("the import wrote nothing");

    const response = await patch(`/api/admin/prospects/${row.id}`, {
      assignedTo: "agnet@example.com",
    });
    expect(response.status).toBe(400);
  });

  it("rejects more ids than the documented cap", async () => {
    const ids = Array.from({ length: 501 }, () => crypto.randomUUID());
    const response = await post("/api/admin/prospects/assign", { ids, assignedTo: AGENT });
    expect(response.status).toBe(400);
  });
});

describe("authorization", () => {
  afterEach(() => {
    env.DEV_USER_EMAIL = ADMIN;
  });

  it("answers 403 on every admin route when the caller is an agent", async () => {
    // ADMIN_EMAILS does not list this address, so roleFor() makes them an agent.
    env.DEV_USER_EMAIL = AGENT;

    expect((await call("/api/me")).status).toBe(200);
    expect((await call("/api/admin/prospects")).status).toBe(403);
    expect((await call("/api/admin/agents")).status).toBe(403);
    expect((await importRows([{ name: "Chez Léa" }])).status).toBe(403);
    expect(
      (await post("/api/admin/prospects/assign", { ids: [crypto.randomUUID()], assignedTo: null }))
        .status,
    ).toBe(403);
    expect((await patch(`/api/admin/prospects/${crypto.randomUUID()}`, { name: "X" })).status).toBe(
      403,
    );
  });

  it("checks the role before the body, so a bad payload still reads as forbidden", async () => {
    env.DEV_USER_EMAIL = AGENT;
    const response = await importRows([{ name: "" }]);
    expect(response.status).toBe(403);
  });
});

/** Local helper so the tests read as prose rather than as Drizzle. */
function eqId(id: string) {
  return eq(prospects.id, id);
}

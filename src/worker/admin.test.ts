import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { ADMIN_VISITS_PAGE_SIZE } from "../shared/constants";
import { prospects, scripts, visits } from "./db/schema";
import type {
  AdminVisitsResponse,
  AgentsResponse,
  AssignResult,
  DuplicatesResponse,
  ImportResult,
  MergeResult,
  Prospect,
  ProspectsResponse,
  Script,
  ScriptsResponse,
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
  // Order matters: visits reference both of the others by foreign key.
  await db.delete(visits);
  await db.delete(prospects);
  await db.delete(scripts);
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

describe("merging duplicates", () => {
  /** The rename case: same door, two rows, because the key carries the name. */
  async function renamedPair(): Promise<{ original: string; renamed: string }> {
    await importRows([{ name: "Chez Léa", lat: 45.7578, lng: 4.832 }]);
    await importRows([{ name: "Chez Léa et Paul", lat: 45.7578, lng: 4.832 }]);

    const rows = await getDb(env.DB).select().from(prospects);
    expect(rows).toHaveLength(2);
    const original = rows.find((r) => r.name === "Chez Léa");
    const renamed = rows.find((r) => r.name === "Chez Léa et Paul");
    if (!original || !renamed) throw new Error("expected both spellings");
    return { original: original.id, renamed: renamed.id };
  }

  it("proposes the renamed pair and nothing else", async () => {
    const { original, renamed } = await renamedPair();
    await importRows([{ name: "Burger King", lat: 45.7578, lng: 4.832 }]);

    const body = (await (
      await call("/api/admin/prospects/duplicates")
    ).json()) as DuplicatesResponse;

    expect(body.truncated).toBe(false);
    expect(body.pairs).toHaveLength(1);
    const ids = [body.pairs[0]?.a.id, body.pairs[0]?.b.id].sort();
    expect(ids).toEqual([original, renamed].sort());
    // Same coordinates, so they are zero metres apart — but still a number.
    expect(body.pairs[0]?.distanceM).toBe(0);
  });

  it("reports how many visits each side carries", async () => {
    const { original, renamed } = await renamedPair();
    const db = getDb(env.DB);
    await db.insert(visits).values({
      id: crypto.randomUUID(),
      prospectId: original,
      agentEmail: AGENT,
      visitedAt: Date.now(),
      clientVisitedAt: Date.now(),
      receivedAt: Date.now(),
      flyerGiven: true,
      outcome: "interested",
      answers: {},
      clientVersion: 1,
    });

    const body = (await (
      await call("/api/admin/prospects/duplicates")
    ).json()) as DuplicatesResponse;
    const pair = body.pairs[0];
    if (!pair) throw new Error("expected a pair");

    const originalSide = pair.a.id === original ? pair.aVisits : pair.bVisits;
    const renamedSide = pair.a.id === renamed ? pair.aVisits : pair.bVisits;
    expect(originalSide).toBe(1);
    expect(renamedSide).toBe(0);
  });

  it("merges, hides the absorbed prospect, and keeps every visit", async () => {
    const { original, renamed } = await renamedPair();
    const db = getDb(env.DB);
    const visitId = crypto.randomUUID();
    await db.insert(visits).values({
      id: visitId,
      prospectId: original,
      agentEmail: AGENT,
      visitedAt: Date.now(),
      clientVisitedAt: Date.now(),
      receivedAt: Date.now(),
      flyerGiven: true,
      outcome: "interested",
      answers: {},
      clientVersion: 1,
    });

    const response = await post("/api/admin/prospects/merge", {
      survivorId: renamed,
      mergedId: original,
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as MergeResult).toEqual({
      survivorId: renamed,
      mergedId: original,
      dedupeKeyUpdated: false, // the survivor's own key already matches its name
    });

    const listed = (await (await call("/api/admin/prospects")).json()) as ProspectsResponse;
    expect(listed.prospects.map((p) => p.id)).toEqual([renamed]);
    expect(listed.total).toBe(1);

    // Nothing was deleted and no visit was repointed: visits are append-only.
    expect(await db.select().from(visits)).toHaveLength(1);
    const [stillThere] = await db.select().from(visits).where(eq(visits.id, visitId));
    expect(stillThere?.prospectId).toBe(original);
  });

  it("drops the absorbed prospect from the agent's round", async () => {
    const { original, renamed } = await renamedPair();
    await post("/api/admin/prospects/assign", {
      ids: [original, renamed],
      assignedTo: ADMIN,
    });
    await post("/api/admin/prospects/merge", { survivorId: renamed, mergedId: original });

    const sync = await post("/api/agent/sync", { clientVersion: 1, prospects: [], visits: [] });
    const body = (await sync.json()) as { prospects: Prospect[] };
    expect(body.prospects.map((p) => p.id)).toEqual([renamed]);
  });

  it("sends a re-import of the old spelling to the survivor", async () => {
    // The path most likely to be got wrong: the absorbed row keeps its dedupe
    // key, so without redirection the import would update a retired prospect
    // and the live one would never see the new data.
    const { original, renamed } = await renamedPair();
    await post("/api/admin/prospects/merge", { survivorId: renamed, mergedId: original });

    const again = await importRows([
      { name: "Chez Léa", lat: 45.7578, lng: 4.832, phone: "0478111111" },
    ]);
    expect(await again.json()).toEqual<ImportResult>({ created: 0, updated: 1 });

    const db = getDb(env.DB);
    expect(await db.select().from(prospects)).toHaveLength(2); // no third row
    const [survivor] = await db.select().from(prospects).where(eq(prospects.id, renamed));
    expect(survivor?.phone).toBe("0478111111");
    // And it keeps the name the admin chose. Writing the old spelling back
    // would restore the stale dedupe key and duplicate again on the next import.
    expect(survivor?.name).toBe("Chez Léa et Paul");
  });

  it("does not duplicate again when the old spreadsheet is imported twice more", async () => {
    // The loop the previous test guards against: revert the name, revert the
    // key, and every later import creates a fresh row.
    const { original, renamed } = await renamedPair();
    await post("/api/admin/prospects/merge", { survivorId: renamed, mergedId: original });

    const old = [{ name: "Chez Léa", lat: 45.7578, lng: 4.832 }];
    await importRows(old);
    await importRows(old);

    expect(await getDb(env.DB).select().from(prospects)).toHaveLength(2);
    const listed = (await (await call("/api/admin/prospects")).json()) as ProspectsResponse;
    expect(listed.prospects.map((p) => p.name)).toEqual(["Chez Léa et Paul"]);
  });

  it("recomputes the survivor's dedupe key when its name has drifted", async () => {
    // PATCH deliberately leaves the key alone, so an edited prospect is still
    // filed under its old spelling. The merge is where that gets fixed, so the
    // next import of the current name matches instead of duplicating again.
    const { original, renamed } = await renamedPair();
    await patch(`/api/admin/prospects/${original}`, { name: "Bistrot Léa" });

    const db = getDb(env.DB);
    const [before] = await db.select().from(prospects).where(eq(prospects.id, original));
    expect(before?.dedupeKey).toContain("chez-lea");

    const response = await post("/api/admin/prospects/merge", {
      survivorId: original,
      mergedId: renamed,
    });
    expect(((await response.json()) as MergeResult).dedupeKeyUpdated).toBe(true);

    const [after] = await db.select().from(prospects).where(eq(prospects.id, original));
    expect(after?.dedupeKey).toContain("bistrot-lea");

    // And now the current name imports as an update rather than a third row.
    const again = await importRows([{ name: "Bistrot Léa", lat: 45.7578, lng: 4.832 }]);
    expect(await again.json()).toEqual<ImportResult>({ created: 0, updated: 1 });
    expect(await db.select().from(prospects)).toHaveLength(2);
  });

  it("keeps the old key when the recomputed one is already taken", async () => {
    // The absorbed row still holds that key. Nothing breaks: a later import of
    // the survivor's name lands on the absorbed row and is redirected there.
    const { original, renamed } = await renamedPair();
    await patch(`/api/admin/prospects/${original}`, { name: "Chez Léa et Paul" });

    const response = await post("/api/admin/prospects/merge", {
      survivorId: original,
      mergedId: renamed,
    });
    expect(((await response.json()) as MergeResult).dedupeKeyUpdated).toBe(false);

    const again = await importRows([{ name: "Chez Léa et Paul", lat: 45.7578, lng: 4.832 }]);
    expect(await again.json()).toEqual<ImportResult>({ created: 0, updated: 1 });
    expect(await getDb(env.DB).select().from(prospects)).toHaveLength(2);
  });

  it("is idempotent", async () => {
    const { original, renamed } = await renamedPair();
    const body = { survivorId: renamed, mergedId: original };

    expect((await post("/api/admin/prospects/merge", body)).status).toBe(200);
    const second = await post("/api/admin/prospects/merge", body);
    expect(second.status).toBe(200);
    expect(((await second.json()) as MergeResult).mergedId).toBe(original);
  });

  it("refuses to merge a prospect into itself", async () => {
    const { renamed } = await renamedPair();
    const response = await post("/api/admin/prospects/merge", {
      survivorId: renamed,
      mergedId: renamed,
    });
    expect(response.status).toBe(400);
  });

  it("refuses to merge a prospect that is already absorbed", async () => {
    const { original, renamed } = await renamedPair();
    await importRows([{ name: "Chez Léa et Paul et Marie", lat: 45.7578, lng: 4.832 }]);
    await post("/api/admin/prospects/merge", { survivorId: renamed, mergedId: original });

    const third = (await getDb(env.DB).select().from(prospects)).find(
      (r) => r.name === "Chez Léa et Paul et Marie",
    );
    if (!third) throw new Error("expected the third spelling");

    const response = await post("/api/admin/prospects/merge", {
      survivorId: third.id,
      mergedId: original,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("already_merged");
  });

  it("answers 404 for an id that does not exist", async () => {
    const { renamed } = await renamedPair();
    const response = await post("/api/admin/prospects/merge", {
      survivorId: renamed,
      mergedId: crypto.randomUUID(),
    });
    expect(response.status).toBe(404);
  });

  it("unmerges, returning the prospect to the list with its visits", async () => {
    const { original, renamed } = await renamedPair();
    await post("/api/admin/prospects/merge", { survivorId: renamed, mergedId: original });

    const response = await post(`/api/admin/prospects/${original}/unmerge`, {});
    expect(response.status).toBe(200);

    const listed = (await (await call("/api/admin/prospects")).json()) as ProspectsResponse;
    expect(listed.prospects.map((p) => p.id).sort()).toEqual([original, renamed].sort());
  });

  it("finds nothing to merge in a clean base", async () => {
    // A detector that cries wolf is worse than none.
    await importRows([
      { name: "Le Bouchon des Halles", lat: 45.7578, lng: 4.832 },
      { name: "Café de la Gare", lat: 45.749, lng: 4.826 },
      { name: "Pizza Roma", lat: 45.762, lng: 4.84 },
      { name: "Le Zinc", lat: 45.7601, lng: 4.8355 },
      { name: "Burger Truck 69", lat: 45.7543, lng: 4.8291 },
    ]);

    const body = (await (
      await call("/api/admin/prospects/duplicates")
    ).json()) as DuplicatesResponse;
    expect(body.pairs).toEqual([]);
  });
});

describe("scripts", () => {
  const question = (over: Partial<Script["questions"][number]> = {}) => ({
    key: "has_delivery",
    label: "Proposez-vous la livraison ?",
    type: "yes_no" as const,
    ...over,
  });

  const saveScript = (body: unknown) => post("/api/admin/scripts", body);

  async function listScripts(): Promise<ScriptsResponse> {
    const response = await call("/api/admin/scripts");
    expect(response.status).toBe(200);
    return (await response.json()) as ScriptsResponse;
  }

  it("saves the first script as version 1, active", async () => {
    const response = await saveScript({ name: "Questionnaire", questions: [question()] });
    expect(response.status).toBe(201);

    const created = (await response.json()) as Script;
    expect(created.version).toBe(1);
    expect(created.isActive).toBe(true);
    expect(created.questions).toHaveLength(1);
  });

  it("saving again writes version N+1 and stands the previous one down", async () => {
    await saveScript({ name: "Questionnaire", questions: [question()] });
    const second = await saveScript({
      name: "Questionnaire",
      questions: [question(), question({ key: "pos_system", type: "text" })],
    });
    expect(second.status).toBe(201);
    expect(((await second.json()) as Script).version).toBe(2);

    const { scripts: all } = await listScripts();
    expect(all.map((s) => [s.version, s.isActive])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it("keeps every old version, because a visit records the one it answered", async () => {
    await saveScript({ name: "Questionnaire", questions: [question()] });
    await saveScript({ name: "Questionnaire", questions: [question()] });
    await saveScript({ name: "Questionnaire", questions: [question()] });

    const { scripts: all } = await listScripts();
    expect(all).toHaveLength(3);
    expect(all.filter((s) => s.isActive)).toHaveLength(1);
  });

  it("numbers versions per name, so a second script starts at 1", async () => {
    await saveScript({ name: "Questionnaire", questions: [question()] });
    const other = await saveScript({ name: "Food trucks", questions: [question()] });
    expect(((await other.json()) as Script).version).toBe(1);

    // ...and it is now the active one: there is exactly one, whatever its name.
    const { scripts: all } = await listScripts();
    expect(all.filter((s) => s.isActive).map((s) => s.name)).toEqual(["Food trucks"]);
  });

  it("lists newest first", async () => {
    await saveScript({ name: "A", questions: [question()] });
    await saveScript({ name: "B", questions: [question()] });

    const { scripts: all } = await listScripts();
    expect(all.map((s) => s.name)).toEqual(["B", "A"]);
  });

  it("returns an empty list rather than 404 when nothing is saved yet", async () => {
    expect((await listScripts()).scripts).toEqual([]);
  });

  describe("the contract the editor has to satisfy", () => {
    it("refuses a single or multi question with no options", async () => {
      const response = await saveScript({
        name: "Q",
        questions: [question({ key: "pos_system", type: "single" })],
      });
      expect(response.status).toBe(400);
    });

    it("accepts a single question that has them", async () => {
      const response = await saveScript({
        name: "Q",
        questions: [question({ key: "pos_system", type: "single", options: ["Aucune", "Papier"] })],
      });
      expect(response.status).toBe(201);
    });

    it("refuses options on a type whose answer does not come from them", async () => {
      const response = await saveScript({
        name: "Q",
        questions: [question({ key: "covers", type: "number", options: ["nope"] })],
      });
      expect(response.status).toBe(400);
    });

    it("refuses two questions sharing a key, which would overwrite an answer", async () => {
      const response = await saveScript({
        name: "Q",
        questions: [question(), question({ label: "Autre question" })],
      });
      expect(response.status).toBe(400);
    });

    it("refuses a key that is not snake_case", async () => {
      const response = await saveScript({
        name: "Q",
        questions: [question({ key: "Has Delivery" })],
      });
      expect(response.status).toBe(400);
    });

    it("refuses a script with no questions at all", async () => {
      expect((await saveScript({ name: "Q", questions: [] })).status).toBe(400);
    });
  });

  it("is admin-only, on both verbs", async () => {
    env.DEV_USER_EMAIL = AGENT;
    try {
      expect((await call("/api/admin/scripts")).status).toBe(403);
      expect((await saveScript({ name: "Q", questions: [question()] })).status).toBe(403);
    } finally {
      env.DEV_USER_EMAIL = ADMIN;
    }
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

describe("GET /api/admin/visits", () => {
  // The reset in the "authorization" block is scoped to it; the admin-only
  // test below would otherwise leave every later test running as an agent.
  afterEach(() => {
    env.DEV_USER_EMAIL = ADMIN;
  });

  /**
   * Written straight to D1 rather than through /api/agent/sync: the feed is
   * about `received_at`, and only a direct insert lets a test place two visits
   * on either side of a known cursor.
   */
  async function seedVisit(name: string, receivedAt: number, outcome = "interested") {
    const db = getDb(env.DB);
    const prospectId = crypto.randomUUID();
    await db.insert(prospects).values({
      id: prospectId,
      name,
      type: "restaurant",
      source: "csv",
      dedupeKey: `test:${name}:${receivedAt}`,
      status: "assigned",
      createdBy: ADMIN,
      createdAt: receivedAt,
      updatedAt: receivedAt,
    });
    await db.insert(visits).values({
      id: crypto.randomUUID(),
      prospectId,
      agentEmail: AGENT,
      visitedAt: receivedAt,
      clientVisitedAt: receivedAt,
      receivedAt,
      flyerGiven: true,
      outcome: outcome as "interested",
      clientVersion: 1,
    });
    return prospectId;
  }

  async function feed(query = ""): Promise<AdminVisitsResponse> {
    const response = await call(`/api/admin/visits${query}`);
    expect(response.status).toBe(200);
    return (await response.json()) as AdminVisitsResponse;
  }

  it("returns an empty list rather than an error before anyone has visited", async () => {
    const body = await feed();
    expect(body.visits).toEqual([]);
    expect(body.serverTime).toBeGreaterThan(0);
  });

  it("orders by received_at, newest first — not by when the phone says it happened", async () => {
    await seedVisit("Le Bouchon", 1_000);
    await seedVisit("Chez Marcel", 3_000);
    await seedVisit("Pizza Vera", 2_000);

    const body = await feed();
    expect(body.visits.map((v) => v.prospectName)).toEqual([
      "Chez Marcel",
      "Pizza Vera",
      "Le Bouchon",
    ]);
  });

  it("joins the prospect name, which is the whole point of the feed", async () => {
    await seedVisit("Le Comptoir", 5_000, "converted");
    const [visit] = (await feed()).visits;
    expect(visit).toMatchObject({
      prospectName: "Le Comptoir",
      agentEmail: AGENT,
      outcome: "converted",
      flyerGiven: true,
      receivedAt: 5_000,
    });
  });

  it("treats `since` as exclusive, so polling returns only what is new", async () => {
    await seedVisit("Ancienne", 1_000);
    await seedVisit("Nouvelle", 2_000);

    const body = await feed("?since=1000");
    expect(body.visits.map((v) => v.prospectName)).toEqual(["Nouvelle"]);
  });

  it("returns everything when `since` is absent, so a fresh tab is not empty", async () => {
    await seedVisit("Le Bouchon", 1_000);
    expect((await feed()).visits).toHaveLength(1);
  });

  it("still shows a visit whose prospect was merged away afterwards", async () => {
    const survivorId = await seedVisit("Le Bouchon", 1_000);
    const mergedId = await seedVisit("Le Bouchon (ancien)", 2_000);

    const merge = await post("/api/admin/prospects/merge", { survivorId, mergedId });
    expect(merge.status).toBe(200);

    // Every other admin list filters merged_into IS NULL. This one must not:
    // no visit is ever repointed, so filtering would delete history from the
    // feed because an admin tidied a duplicate (docs/domains/prospecting.md).
    expect((await feed()).visits).toHaveLength(2);
  });

  it("caps the page, and refuses a limit above it", async () => {
    await seedVisit("Le Bouchon", 1_000);
    await seedVisit("Chez Marcel", 2_000);

    expect((await feed("?limit=1")).visits).toHaveLength(1);
    expect((await call(`/api/admin/visits?limit=${ADMIN_VISITS_PAGE_SIZE + 1}`)).status).toBe(400);
  });

  it("rejects a `since` that is not a non-negative integer", async () => {
    expect((await call("/api/admin/visits?since=hier")).status).toBe(400);
    expect((await call("/api/admin/visits?since=-1")).status).toBe(400);
  });

  it("is admin-only", async () => {
    env.DEV_USER_EMAIL = AGENT;
    expect((await call("/api/admin/visits")).status).toBe(403);
  });
});

/** Local helper so the tests read as prose rather than as Drizzle. */
function eqId(id: string) {
  return eq(prospects.id, id);
}

/**
 * Admin routes — docs/api.md, docs/domains/prospecting.md.
 *
 * Everything here is behind `requireAdmin` (mounted in index.ts): importing,
 * editing and assigning prospects is admin-only (identity-access.md). The
 * remaining stubs answer 501 rather than pretending to succeed.
 */
import { Hono } from "hono";
import { and, count, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { chunk } from "../../shared/chunk";
import { DUPLICATES_PAGE_SIZE, DUPLICATES_SCAN_LIMIT } from "../../shared/constants";
import { dedupeKey, normalize } from "../../shared/dedupe";
import { distanceMeters } from "../../shared/geo";
import { isProbablySamePlace } from "../../shared/similarity";
import {
  assignSchema,
  mergeSchema,
  overpassImportSchema,
  prospectBatchSchema,
  prospectIdParamSchema,
  prospectPatchSchema,
  prospectsQuerySchema,
  scriptCreateSchema,
} from "../../shared/schemas";
import type {
  AgentsResponse,
  AssignResult,
  DuplicatesResponse,
  ImportResult,
  MergeResult,
  Prospect,
  ProspectsResponse,
} from "../../shared/schemas";
import { parseEmails, roleFor } from "../auth";
import { validate } from "../validate";
import { boundParamsPerRow, getDb } from "../db/client";
import { prospects, visits } from "../db/schema";
import type { NewProspectRow, ProspectRow } from "../db/schema";
import type { AppEnv } from "../types";

export const adminRoutes = new Hono<AppEnv>();

const notYet = (milestone: string) =>
  ({ error: "not_implemented", message: `Arrive en ${milestone}.` }) as const;

function toWireProspect(row: ProspectRow): Prospect {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    phone: row.phone,
    website: row.website,
    cuisine: row.cuisine,
    source: row.source,
    status: row.status,
    assignedTo: row.assignedTo,
    lastVisitAt: row.lastVisitAt,
    nextVisitAt: row.nextVisitAt,
  };
}

/* ------------------------------------------------------------------- people */

/**
 * Everyone a prospect can be assigned to.
 *
 * There is no users table (ADR-0006): identity comes from Cloudflare Access and
 * the role from ADMIN_EMAILS. AGENT_EMAILS lists the rest, so the assign menu
 * has something to show before anyone has been assigned anything. Admins are
 * included — in a two-person field team an admin may well walk a round.
 */
function assignableEmails(env: AppEnv["Bindings"]): string[] {
  return [...new Set([...parseEmails(env.ADMIN_EMAILS), ...parseEmails(env.AGENT_EMAILS)])].sort();
}

adminRoutes.get("/agents", (c) => {
  return c.json<AgentsResponse>({
    agents: assignableEmails(c.env).map((email) => ({
      email,
      role: roleFor(email, c.env.ADMIN_EMAILS),
    })),
  });
});

/**
 * A syntactically valid email is not enough.
 *
 * Assigning to an address nobody holds is silent data loss in slow motion: the
 * prospect disappears from every agent's sync pull, which matches on the exact
 * email, while the admin list still shows it as assigned and handled. One typo
 * and a restaurant is never visited again. So the assignee has to be on the
 * roster, and `null` — unassign — is always allowed.
 */
function unknownAssignee(email: string | null, env: AppEnv["Bindings"]): boolean {
  return email !== null && !assignableEmails(env).includes(email);
}

/* ---------------------------------------------------------------- prospects */

adminRoutes.get("/prospects", validate("query", prospectsQuerySchema), async (c) => {
  const { status, assignedTo, source, limit, offset } = c.req.valid("query");
  const db = getDb(c.env.DB);

  const filters = [
    // A merged prospect is not a row the admin manages any more.
    isNull(prospects.mergedInto),
    status ? eq(prospects.status, status) : undefined,
    assignedTo ? eq(prospects.assignedTo, assignedTo) : undefined,
    source ? eq(prospects.source, source) : undefined,
  ].filter((f) => f !== undefined);
  const where = and(...filters);

  const rows = await db
    .select()
    .from(prospects)
    .where(where)
    .orderBy(desc(prospects.updatedAt))
    .limit(limit)
    .offset(offset);

  const [totals] = await db.select({ total: count() }).from(prospects).where(where);

  return c.json<ProspectsResponse>({
    prospects: rows.map(toWireProspect),
    total: totals?.total ?? 0,
  });
});

/**
 * Import. Upsert by dedupe key, so re-importing a corrected spreadsheet updates
 * in place instead of duplicating — the thing the spreadsheet workflow cannot do.
 *
 * Only descriptive fields are updated. Status, assignment and visit history are
 * never touched by an import (prospecting.md).
 */
adminRoutes.post("/prospects/batch", validate("json", prospectBatchSchema), async (c) => {
  const { source, rows: incoming } = c.req.valid("json");
  const { email } = c.get("identity");
  const db = getDb(c.env.DB);
  const now = Date.now();

  /**
   * Collapse duplicates within the request first. SQLite refuses an
   * ON CONFLICT DO UPDATE that would touch the same row twice in one statement
   * ("cannot affect row a second time") and would fail the whole chunk, so two
   * spreadsheet lines for the same place must become one row here. Last wins.
   */
  const byKey = new Map<string, NewProspectRow>();
  for (const row of incoming) {
    const key = dedupeKey({
      name: row.name,
      sourceRef: row.sourceRef,
      lat: row.lat,
      lng: row.lng,
      address: row.address,
    });
    byKey.set(key, {
      id: crypto.randomUUID(),
      name: row.name,
      type: row.type,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      address: row.address ?? null,
      phone: row.phone ?? null,
      website: row.website ?? null,
      cuisine: row.cuisine ?? null,
      source,
      sourceRef: row.sourceRef ?? null,
      dedupeKey: key,
      status: "new",
      assignedTo: null,
      createdBy: email,
      createdAt: now,
      updatedAt: now,
    });
  }

  let created = 0;
  let updated = 0;

  /**
   * A merged prospect keeps its dedupe key, so re-importing the spelling it was
   * filed under still lands on it. Redirect those rows to the survivor, or the
   * import would quietly update a prospect the admin has already retired and
   * the live one would never see the new data.
   */
  const survivorByKey = new Map<string, string>();
  for (const keyBatch of chunk([...byKey.keys()], 2)) {
    const merged = await db
      .select({ dedupeKey: prospects.dedupeKey, mergedInto: prospects.mergedInto })
      .from(prospects)
      .where(and(inArray(prospects.dedupeKey, keyBatch), isNotNull(prospects.mergedInto)));
    for (const row of merged) {
      if (row.mergedInto) survivorByKey.set(row.dedupeKey, row.mergedInto);
    }
  }

  for (const [key, survivorId] of survivorByKey) {
    const row = byKey.get(key);
    byKey.delete(key);
    if (!row) continue;

    /**
     * Same "only overwrite what the import carries" rule as the upsert below,
     * with one addition: the name is left alone.
     *
     * We are here because the admin merged the spelling this row is filed under
     * into the survivor, which is a deliberate and more recent statement about
     * what this place is called than an old spreadsheet is. Writing the name
     * would rename the survivor back, restore its stale dedupe key, and have
     * the next import create the duplicate all over again.
     */
    const [touched] = await db
      .update(prospects)
      .set({
        type: row.type,
        lat: row.lat ?? sql`${prospects.lat}`,
        lng: row.lng ?? sql`${prospects.lng}`,
        address: row.address ?? sql`${prospects.address}`,
        phone: row.phone ?? sql`${prospects.phone}`,
        website: row.website ?? sql`${prospects.website}`,
        cuisine: row.cuisine ?? sql`${prospects.cuisine}`,
        updatedAt: now,
      })
      .where(and(eq(prospects.id, survivorId), isNull(prospects.mergedInto)))
      .returning({ id: prospects.id });
    if (touched) updated += 1;
  }

  for (const batch of chunk([...byKey.values()], boundParamsPerRow(prospects))) {
    const written = await db
      .insert(prospects)
      .values(batch)
      .onConflictDoUpdate({
        target: prospects.dedupeKey,
        /**
         * An import overwrites a field only when it carries a value for it.
         *
         * Without the coalesce, a CSV whose phone column is unmapped — which
         * the column-mapping step makes a one-click mistake — would send null
         * for every row and silently erase every phone number we had. The
         * spreadsheet is authoritative about what it says, not about what it
         * leaves out. Clearing a field on purpose is what PATCH is for.
         *
         * `name` and `type` are always written: name is required by the
         * schema, and type carries its own default, so neither can arrive
         * empty to mean "unchanged".
         */
        set: {
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          lat: sql`coalesce(excluded.lat, ${prospects.lat})`,
          lng: sql`coalesce(excluded.lng, ${prospects.lng})`,
          address: sql`coalesce(excluded.address, ${prospects.address})`,
          phone: sql`coalesce(excluded.phone, ${prospects.phone})`,
          website: sql`coalesce(excluded.website, ${prospects.website})`,
          cuisine: sql`coalesce(excluded.cuisine, ${prospects.cuisine})`,
          sourceRef: sql`coalesce(excluded.source_ref, ${prospects.sourceRef})`,
          updatedAt: now,
        },
      })
      .returning({ id: prospects.id });

    // An insert keeps the id we generated for it; a conflict returns the id of
    // the row that already existed. Comparing ids is exact, where comparing
    // timestamps would miscount a row written in this same millisecond.
    const proposed = new Set(batch.map((row) => row.id));
    for (const row of written) {
      if (proposed.has(row.id)) created += 1;
      else updated += 1;
    }
  }

  return c.json<ImportResult>({ created, updated });
});

/**
 * Admin edit. `status` is accepted here (prospecting.md: an admin may reopen or
 * close a prospect by hand); INVARIANT 3 still holds, because no client ever
 * sends a status *derived from a visit*.
 *
 * The dedupe key is deliberately not recomputed when the name or address
 * changes: it is import-time identity, and recomputing could collide with the
 * unique index and fail an otherwise valid edit.
 */
adminRoutes.patch(
  "/prospects/:id",
  validate("param", prospectIdParamSchema),
  validate("json", prospectPatchSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");

    if (patch.assignedTo !== undefined && unknownAssignee(patch.assignedTo, c.env)) {
      return c.json(
        { error: "unknown_assignee", message: "Cette adresse ne figure pas parmi les agents." },
        400,
      );
    }

    const db = getDb(c.env.DB);

    const [row] = await db
      .update(prospects)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(prospects.id, id))
      .returning();

    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(toWireProspect(row));
  },
);

/**
 * Bulk assign, and bulk unassign with `assignedTo: null`.
 *
 * Status moves only along the two edges prospecting.md allows: new → assigned
 * on assignment, assigned → new on unassignment. A prospect that has been
 * visited (follow_up, converted, rejected) keeps the status its visits earned.
 */
adminRoutes.post("/prospects/assign", validate("json", assignSchema), async (c) => {
  const { ids, assignedTo } = c.req.valid("json");

  if (unknownAssignee(assignedTo, c.env)) {
    return c.json(
      { error: "unknown_assignee", message: "Cette adresse ne figure pas parmi les agents." },
      400,
    );
  }

  const db = getDb(c.env.DB);
  const now = Date.now();

  // Each id binds one parameter and the SET clause binds a few more, so we ask
  // for half of D1's budget rather than counting them by hand (INVARIANT 7).
  const batches = chunk([...new Set(ids)], 2);
  let assigned = 0;

  for (const batch of batches) {
    const touched = await db
      .update(prospects)
      .set({ assignedTo, updatedAt: now })
      .where(inArray(prospects.id, batch))
      .returning({ id: prospects.id });
    assigned += touched.length;

    await db
      .update(prospects)
      .set({ status: assignedTo ? "assigned" : "new", updatedAt: now })
      .where(
        and(inArray(prospects.id, batch), eq(prospects.status, assignedTo ? "new" : "assigned")),
      );
  }

  return c.json<AssignResult>({ assigned });
});

/* ---------------------------------------------------------------- merging */

/** Null when either side has no coordinates; the UI shows a dash, not a zero. */
function metresBetween(a: ProspectRow, b: ProspectRow): number | null {
  if (typeof a.lat !== "number" || typeof a.lng !== "number") return null;
  if (typeof b.lat !== "number" || typeof b.lng !== "number") return null;
  return Math.round(distanceMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }));
}

/**
 * Candidate duplicates: two live prospects that are probably one place.
 *
 * The dedupe key cannot catch these, because tiers 2 and 3 are built from the
 * name — rename a prospect between imports and it gets a new key and a new row
 * (prospecting.md). This finds those pairs again.
 *
 * Comparing every pair would be quadratic and this runs inside a 10 ms CPU
 * budget, so prospects are bucketed into ~110 m cells first and each one is
 * only compared against its own cell and the eight around it. The radius that
 * counts as "same place" is 50 m, so nothing within range falls outside.
 */
adminRoutes.get("/prospects/duplicates", async (c) => {
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(prospects)
    .where(isNull(prospects.mergedInto))
    .orderBy(desc(prospects.updatedAt))
    .limit(DUPLICATES_SCAN_LIMIT + 1);

  const truncated = rows.length > DUPLICATES_SCAN_LIMIT;
  const scanned = truncated ? rows.slice(0, DUPLICATES_SCAN_LIMIT) : rows;

  const CELL = 1000; // three decimal places
  const cellKey = (lat: number, lng: number) =>
    `${Math.round(lat * CELL)}:${Math.round(lng * CELL)}`;

  const buckets = new Map<string, ProspectRow[]>();
  const put = (key: string, row: ProspectRow) => {
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  };

  for (const row of scanned) {
    if (typeof row.lat === "number" && typeof row.lng === "number") {
      put(cellKey(row.lat, row.lng), row);
    } else {
      // No coordinates: the name is all there is, so bucket by that instead.
      put(`name:${normalize(row.name)}`, row);
    }
  }

  const pairs: { a: ProspectRow; b: ProspectRow; distanceM: number | null }[] = [];
  const seen = new Set<string>();

  for (const row of scanned) {
    const neighbourhood: ProspectRow[] = [];
    if (typeof row.lat === "number" && typeof row.lng === "number") {
      const lat = Math.round(row.lat * CELL);
      const lng = Math.round(row.lng * CELL);
      for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLng = -1; dLng <= 1; dLng++) {
          neighbourhood.push(...(buckets.get(`${lat + dLat}:${lng + dLng}`) ?? []));
        }
      }
    } else {
      neighbourhood.push(...(buckets.get(`name:${normalize(row.name)}`) ?? []));
    }

    for (const other of neighbourhood) {
      if (other.id === row.id) continue;
      const pairKey = row.id < other.id ? `${row.id}|${other.id}` : `${other.id}|${row.id}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      if (!isProbablySamePlace(row, other)) continue;
      pairs.push({ a: row, b: other, distanceM: metresBetween(row, other) });
      if (pairs.length >= DUPLICATES_PAGE_SIZE) break;
    }
    if (pairs.length >= DUPLICATES_PAGE_SIZE) break;
  }

  // Visit counts, so the admin chooses between two known things rather than
  // guessing which side carries the history.
  const ids = [...new Set(pairs.flatMap((p) => [p.a.id, p.b.id]))];
  const counts = new Map<string, number>();
  for (const batch of chunk(ids, 2)) {
    const rows = await db
      .select({ prospectId: visits.prospectId, n: count() })
      .from(visits)
      .where(inArray(visits.prospectId, batch))
      .groupBy(visits.prospectId);
    for (const row of rows) counts.set(row.prospectId, row.n);
  }

  return c.json<DuplicatesResponse>({
    truncated,
    pairs: pairs.map((p) => ({
      a: toWireProspect(p.a),
      b: toWireProspect(p.b),
      distanceM: p.distanceM,
      aVisits: counts.get(p.a.id) ?? 0,
      bVisits: counts.get(p.b.id) ?? 0,
    })),
  });
});

/**
 * Merge one prospect into another. Soft, and therefore reversible.
 *
 * Nothing is deleted and no visit is repointed — visits are append-only. The
 * absorbed prospect keeps everything it had and simply stops being live, so an
 * admin who merges the wrong pair can undo it.
 *
 * The survivor keeps its own status and assignment: status is derived from its
 * own visits (INVARIANT 3), and the loser's visits stay on the loser.
 */
adminRoutes.post("/prospects/merge", validate("json", mergeSchema), async (c) => {
  const { survivorId, mergedId } = c.req.valid("json");
  const db = getDb(c.env.DB);

  const found = await db
    .select()
    .from(prospects)
    .where(inArray(prospects.id, [survivorId, mergedId]));
  const survivor = found.find((r) => r.id === survivorId);
  const merged = found.find((r) => r.id === mergedId);

  if (!survivor || !merged) return c.json({ error: "not_found" }, 404);

  // INVARIANT 4: repeating a merge is a no-op, not an error.
  if (merged.mergedInto === survivorId) {
    return c.json<MergeResult>({ survivorId, mergedId, dedupeKeyUpdated: false });
  }
  if (survivor.mergedInto !== null || merged.mergedInto !== null) {
    return c.json(
      {
        error: "already_merged",
        message: "Un de ces prospects a déjà été fusionné. Annulez la fusion d'abord.",
      },
      400,
    );
  }

  /**
   * Recompute the survivor's key from its current fields, so the next import of
   * the corrected name matches it silently instead of creating this duplicate
   * all over again. If that key already belongs to another live prospect, keep
   * the old one and say so — that collision is another merge, not an error.
   */
  const desiredKey = dedupeKey({
    name: survivor.name,
    sourceRef: survivor.sourceRef,
    lat: survivor.lat,
    lng: survivor.lng,
    address: survivor.address,
  });
  let dedupeKeyUpdated = false;
  if (desiredKey !== survivor.dedupeKey) {
    const [taken] = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(and(eq(prospects.dedupeKey, desiredKey), ne(prospects.id, survivorId)))
      .limit(1);
    dedupeKeyUpdated = !taken;
  }

  const now = Date.now();
  await db
    .update(prospects)
    .set({ mergedInto: survivorId, updatedAt: now })
    .where(eq(prospects.id, mergedId));

  if (dedupeKeyUpdated) {
    await db
      .update(prospects)
      .set({ dedupeKey: desiredKey, updatedAt: now })
      .where(eq(prospects.id, survivorId));
  }

  return c.json<MergeResult>({ survivorId, mergedId, dedupeKeyUpdated });
});

/** Undo a merge. The absorbed prospect returns to the list with its visits. */
adminRoutes.post("/prospects/:id/unmerge", validate("param", prospectIdParamSchema), async (c) => {
  const { id } = c.req.valid("param");
  const db = getDb(c.env.DB);

  const [row] = await db
    .update(prospects)
    .set({ mergedInto: null, updatedAt: Date.now() })
    .where(eq(prospects.id, id))
    .returning();

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(toWireProspect(row));
});

/* ------------------------------------------------------------ not yet built */

adminRoutes.post("/import/overpass", validate("json", overpassImportSchema), (c) =>
  c.json(notYet("M4"), 501),
);

adminRoutes.get("/visits", (c) => c.json(notYet("M4"), 501));

adminRoutes.get("/scripts", (c) => c.json(notYet("M3"), 501));

adminRoutes.post("/scripts", validate("json", scriptCreateSchema), (c) =>
  c.json(notYet("M3"), 501),
);

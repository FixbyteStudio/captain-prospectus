/**
 * Admin routes — docs/api.md, docs/domains/prospecting.md.
 *
 * Everything here is behind `requireAdmin` (mounted in index.ts): importing,
 * editing and assigning prospects is admin-only (identity-access.md). The
 * remaining stubs answer 501 rather than pretending to succeed.
 */
import { Hono } from "hono";
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { chunk } from "../../shared/chunk";
import {
  DUPLICATES_PAGE_SIZE,
  DUPLICATES_SCAN_LIMIT,
  EXPORT_ROWS,
  ORPHAN_CANDIDATES,
  ORPHANS_PAGE_SIZE,
  OVERPASS_CACHE_TTL_MS,
  PLACES_CACHE_TTL_MS,
  SCRIPTS_PAGE_SIZE,
} from "../../shared/constants";
import {
  CSV_ATTRIBUTION,
  csvDisposition,
  csvFile,
  csvFilename,
  csvTimestamp,
} from "../../shared/csv";
import { dedupeKey, normalize } from "../../shared/dedupe";
import { distanceMeters } from "../../shared/geo";
import { isProbablySamePlace } from "../../shared/similarity";
import {
  assignSchema,
  mergeSchema,
  orphanRepairSchema,
  overpassImportSchema,
  placesImportSchema,
  visitsSinceQuerySchema,
  prospectBatchSchema,
  prospectIdParamSchema,
  prospectPatchSchema,
  prospectsExportQuerySchema,
  prospectsQuerySchema,
  scriptCreateSchema,
  visitsExportQuerySchema,
  visitIdParamSchema,
} from "../../shared/schemas";
import type {
  AdminVisitsResponse,
  OrphanCandidate,
  OrphanedVisit,
  OrphanRepairResult,
  OrphansResponse,
  AgentsResponse,
  AssignResult,
  DuplicatesResponse,
  ImportResult,
  MergeResult,
  AreaSearchResponse,
  Prospect,
  ProspectsResponse,
  Script,
  ScriptsResponse,
} from "../../shared/schemas";
import { parseEmails, roleFor } from "../auth";
import { validate } from "../validate";
import { boundParamsPerRow, getDb } from "../db/client";
import { overpassCache, prospects, scripts, visits, visitsOrphaned } from "../db/schema";
import {
  OVERPASS_ENDPOINT,
  OVERPASS_USER_AGENT,
  buildOverpassQuery,
  polygonHash,
  toCandidates,
} from "../overpass";
import {
  PLACES_ENDPOINT,
  PLACES_FIELD_MASK,
  buildPlacesBody,
  circleHash,
  toCandidates as toPlaceCandidates,
} from "../places";
import type { NewProspectRow, ProspectRow } from "../db/schema";
import { deriveProspectStatus } from "./status";
import { toWireScript } from "./wire";
import type { AppEnv } from "../types";

export const adminRoutes = new Hono<AppEnv>();

/**
 * Overpass is a public service that is sometimes slow, rate-limited or down
 * (ADR-0008). The message says what happened and what to do, because "502" on
 * its own reads as "the app is broken" rather than "someone else's server is".
 */
const OVERPASS_UNAVAILABLE = {
  error: "overpass_failed",
  message: "OpenStreetMap n'a pas répondu. Réessayez dans quelques instants.",
} as const;

/** The same, for the other provider (ADR-0020). */
const PLACES_UNAVAILABLE = {
  error: "places_failed",
  message: "Google Places n'a pas répondu. Réessayez dans quelques instants.",
} as const;

/**
 * No key on this deployment. A different fact from "the provider failed", and
 * the admin can act on it — nobody has run `wrangler secret put` — so it gets
 * its own code and its own status rather than a 502 that reads as Google's
 * fault (ADR-0020).
 */
const PLACES_UNCONFIGURED = {
  error: "places_unconfigured",
  message: "Le fournisseur Google n'est pas configuré sur ce serveur.",
} as const;

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
 * The prospect ledger as a CSV file.
 *
 * Registered **above** `/prospects/:id`, so the literal path is never read as
 * an id. Filtered exactly as the list screen filters, reusing its schema's
 * enums — an export that filtered differently from the screen it was launched
 * from would be a quiet lie.
 *
 * Merged prospects are excluded like every other list: the survivor is the row
 * that still means something (prospecting.md).
 */
adminRoutes.get(
  "/prospects/export.csv",
  validate("query", prospectsExportQuerySchema),
  async (c) => {
    const { status, assignedTo, source } = c.req.valid("query");
    const db = getDb(c.env.DB);
    const now = Date.now();

    const filters = [isNull(prospects.mergedInto)];
    if (status) filters.push(eq(prospects.status, status));
    if (assignedTo) filters.push(eq(prospects.assignedTo, assignedTo));
    if (source) filters.push(eq(prospects.source, source));

    // One row over the cap, so "was there more?" needs no second COUNT query —
    // D1 bills rows scanned, and the answer is one row's worth of scan.
    const rows = await db
      .select()
      .from(prospects)
      .where(and(...filters))
      .orderBy(desc(prospects.updatedAt))
      .limit(EXPORT_ROWS + 1);

    const truncated = rows.length > EXPORT_ROWS;
    const page = truncated ? rows.slice(0, EXPORT_ROWS) : rows;

    // snake_case like the columns, not the wire's camelCase: the reader here is
    // a spreadsheet and whoever opens it, not the client.
    const body = csvFile(
      [
        "name",
        "type",
        "address",
        "phone",
        "website",
        "cuisine",
        "status",
        "assigned_to",
        "source",
        "lat",
        "lng",
        "last_visit_at",
        "next_visit_at",
      ],
      page.map((p) => [
        p.name,
        p.type,
        p.address,
        p.phone,
        p.website,
        p.cuisine,
        p.status,
        p.assignedTo,
        p.source,
        p.lat,
        p.lng,
        csvTimestamp(p.lastVisitAt),
        csvTimestamp(p.nextVisitAt),
      ]),
      CSV_ATTRIBUTION,
    );

    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": csvDisposition(csvFilename("prospects", now)),
        ...(truncated ? { "x-truncated": "true" } : {}),
      },
    });
  },
);

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

/* ------------------------------------------------------------------- scripts */

/**
 * Every version, newest first — docs/domains/scripts.md.
 *
 * Old versions are kept and listed: a visit records the `script_id` it was
 * answered with, so reading historical answers means reading the version that
 * was active at the time.
 */
adminRoutes.get("/scripts", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(scripts)
    .orderBy(desc(scripts.createdAt), desc(scripts.id))
    .limit(SCRIPTS_PAGE_SIZE);

  return c.json<ScriptsResponse>({ scripts: rows.map(toWireScript) });
});

/**
 * Save a script: write version N+1 of that name and make it the active one.
 *
 * Editing never updates a row. An answer is only interpretable against the
 * questions it was asked from, and `visits.script_id` points at a specific
 * version, so changing one in place would silently rewrite history
 * (docs/domains/scripts.md, docs/data-model.md).
 */
adminRoutes.post("/scripts", validate("json", scriptCreateSchema), async (c) => {
  const { name, questions } = c.req.valid("json");
  const db = getDb(c.env.DB);

  const [latest] = await db
    .select({ version: scripts.version })
    .from(scripts)
    .where(eq(scripts.name, name))
    .orderBy(desc(scripts.version))
    .limit(1);

  // D1 has no interactive transaction. A batch is one atomic unit, which is
  // what keeps "exactly one active script" true between these two statements —
  // and `scripts_one_active_idx` refuses the write outright if it ever is not.
  const [, inserted] = await db.batch([
    db.update(scripts).set({ isActive: false }).where(eq(scripts.isActive, true)),
    db
      .insert(scripts)
      .values({
        name,
        version: (latest?.version ?? 0) + 1,
        questions,
        isActive: true,
        createdAt: Date.now(),
      })
      .returning(),
  ]);

  const row = inserted[0];
  if (!row) return c.json({ error: "internal" }, 500);
  return c.json<Script>(toWireScript(row), 201);
});

/* ------------------------------------------------------------- map import */

/**
 * Find places inside a polygon — ADR-0008, docs/domains/ingestion.md.
 *
 * Nothing is written to `prospects` here: this returns candidates, the admin
 * previews them, and the existing `POST /prospects/batch` does the importing.
 * One pipeline, two sources.
 *
 * The browser never calls Overpass itself (INVARIANT 11). Routing it through
 * the Worker is what makes the cache — and therefore the etiquette owed to a
 * donated public service — possible at all.
 */
adminRoutes.post("/import/overpass", validate("json", overpassImportSchema), async (c) => {
  const { polygon } = c.req.valid("json");
  const db = getDb(c.env.DB);

  const hash = await polygonHash(polygon);
  const [hit] = await db.select().from(overpassCache).where(eq(overpassCache.hash, hash)).limit(1);

  const fresh = hit && Date.now() - hit.createdAt < OVERPASS_CACHE_TTL_MS;
  if (fresh) {
    const mapped = toCandidates(hit.body);
    // A cached body that no longer parses is a bug in what we stored, not
    // something to hand the admin. Fall through and ask Overpass again.
    if (mapped) {
      return c.json<AreaSearchResponse>({ ...mapped, cached: true });
    }
  }

  let response: Response;
  try {
    response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": OVERPASS_USER_AGENT,
      },
      body: `data=${encodeURIComponent(buildOverpassQuery(polygon))}`,
    });
  } catch {
    // No retry loop, here or on the client: Overpass is shared infrastructure
    // and a Worker hammering it is exactly what gets an IP blocked. The screen
    // offers the admin a retry button instead (ADR-0008).
    return c.json(OVERPASS_UNAVAILABLE, 502);
  }

  if (!response.ok) return c.json(OVERPASS_UNAVAILABLE, 502);

  const body = await response.text();
  const mapped = toCandidates(body);
  // Overpass answers a rate limit or an outage with HTML and a 200.
  if (!mapped) return c.json(OVERPASS_UNAVAILABLE, 502);

  /**
   * Upsert, not `onConflictDoNothing` (the INVARIANT 4 default): two admins
   * drawing the same area a week apart must refresh the entry, not keep serving
   * the older one until it expires. Replaying this request is still a no-op in
   * every way the admin can observe.
   */
  await db
    .insert(overpassCache)
    .values({ hash, body, createdAt: Date.now() })
    .onConflictDoUpdate({
      target: overpassCache.hash,
      set: { body, createdAt: Date.now() },
    });

  return c.json<AreaSearchResponse>({ ...mapped, cached: false });
});

/**
 * Find places inside a circle — ADR-0020, docs/domains/ingestion.md.
 *
 * The other provider, deliberately the same route in every way it can be: same
 * cache table, same candidate shape, same preview, nothing written to
 * `prospects` here. A circle rather than a polygon because Nearby Search has no
 * polygon search, and at most 20 results because Google has no page tokens.
 *
 * Two things differ from Overpass and both matter. The key is a secret that
 * must never leave the Worker, which is why this cannot be a browser call at
 * all. And a miss costs money, so the cache here is not politeness — it is the
 * difference between paying once for a circle and paying every time the admin
 * presses the button again.
 */
adminRoutes.post("/import/places", validate("json", placesImportSchema), async (c) => {
  const key = c.env.GOOGLE_PLACES_KEY;
  // Checked before anything else: no key means no search is possible, and
  // answering that without touching D1 or Google is the honest order.
  if (!key) return c.json(PLACES_UNCONFIGURED, 503);

  const { center, radius } = c.req.valid("json");
  const db = getDb(c.env.DB);

  const hash = await circleHash(center, radius);
  const [hit] = await db.select().from(overpassCache).where(eq(overpassCache.hash, hash)).limit(1);

  const fresh = hit && Date.now() - hit.createdAt < PLACES_CACHE_TTL_MS;
  if (fresh) {
    const mapped = toPlaceCandidates(hit.body);
    // A cached body that no longer parses is a bug in what we stored, not
    // something to hand the admin. Fall through and ask Google again.
    if (mapped) {
      return c.json<AreaSearchResponse>({ ...mapped, cached: true });
    }
  }

  let response: Response;
  try {
    response = await fetch(PLACES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // Omitting this is a 400 from Google, and widening it past the Pro
        // fields changes the SKU we are billed at (ADR-0020).
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: buildPlacesBody(center, radius),
    });
  } catch {
    // No retry loop, here or on the client. With Overpass that was etiquette;
    // here a retry is also another billable call, so it stays the admin's
    // decision and the screen offers them the button.
    return c.json(PLACES_UNAVAILABLE, 502);
  }

  // Never surface Google's own body: a 400 from a bad field mask echoes the
  // request back, and the key is in the headers of that request.
  if (!response.ok) return c.json(PLACES_UNAVAILABLE, 502);

  const body = await response.text();
  const mapped = toPlaceCandidates(body);
  if (!mapped) return c.json(PLACES_UNAVAILABLE, 502);

  // Upsert for the same reason as the Overpass cache above, plus one: a refresh
  // that keeps serving a week-old answer is a week of searches we do not pay
  // for twice.
  await db
    .insert(overpassCache)
    .values({ hash, body, createdAt: Date.now() })
    .onConflictDoUpdate({
      target: overpassCache.hash,
      set: { body, createdAt: Date.now() },
    });

  return c.json<AreaSearchResponse>({ ...mapped, cached: false });
});

/* ---------------------------------------------------------------- live feed */

/**
 * Visits as they arrive — ADR-0010, docs/design.md "The live feed".
 *
 * Ordered by `received_at`, not `visited_at`: the feed answers "what has
 * reached me", and a phone that synced a three-day-old visit this minute is
 * news. `visits_received_idx` exists for exactly this ordering.
 *
 * `since` is exclusive, so the client can pass back the last `receivedAt` it
 * saw and get only what is new. Polling every 15 s makes that the difference
 * between 500 rows and none.
 */
adminRoutes.get("/visits", validate("query", visitsSinceQuerySchema), async (c) => {
  const { since, limit } = c.req.valid("query");
  const db = getDb(c.env.DB);

  /**
   * Joined to prospects for the name — and deliberately NOT filtered on
   * `merged_into IS NULL`, which every other admin list does.
   *
   * This one records what agents did, and an absorbed prospect keeps its own
   * visits (docs/domains/prospecting.md): no visit is ever repointed, so
   * filtering here would make a visit vanish from the feed because an admin
   * merged a duplicate afterwards. The name shown is the one the visit was
   * actually made against.
   */
  const rows = await db
    .select({
      id: visits.id,
      prospectId: visits.prospectId,
      prospectName: prospects.name,
      agentEmail: visits.agentEmail,
      visitedAt: visits.visitedAt,
      receivedAt: visits.receivedAt,
      flyerGiven: visits.flyerGiven,
      outcome: visits.outcome,
      followUpAt: visits.followUpAt,
      notes: visits.notes,
    })
    .from(visits)
    .innerJoin(prospects, eq(visits.prospectId, prospects.id))
    .where(since > 0 ? gt(visits.receivedAt, since) : undefined)
    .orderBy(desc(visits.receivedAt))
    .limit(limit);

  return c.json<AdminVisitsResponse>({ visits: rows, serverTime: Date.now() });
});

/**
 * Visits as a CSV file, for a date range.
 *
 * Filtered on `received_at`, not `visited_at` (INVARIANT 12). A phone can sync
 * days late, and a range read against the phone's clock would silently drop
 * exactly those visits — the ones most worth looking at.
 *
 * Registered above `/visits/orphaned` and `/visits/:id`-shaped routes for the
 * same reason the prospect export is: a literal path must never be read as an
 * id. Joined to prospects for the name, and NOT filtered on `merged_into`,
 * matching the live feed — this records what agents did, and an absorbed
 * prospect keeps its visits.
 */
adminRoutes.get("/visits/export.csv", validate("query", visitsExportQuerySchema), async (c) => {
  const { from, to } = c.req.valid("query");
  const db = getDb(c.env.DB);
  const now = Date.now();

  const rows = await db
    .select({
      visitedAt: visits.visitedAt,
      receivedAt: visits.receivedAt,
      agentEmail: visits.agentEmail,
      prospectName: prospects.name,
      outcome: visits.outcome,
      flyerGiven: visits.flyerGiven,
      followUpAt: visits.followUpAt,
      notes: visits.notes,
    })
    .from(visits)
    .innerJoin(prospects, eq(visits.prospectId, prospects.id))
    .where(and(gte(visits.receivedAt, from), lte(visits.receivedAt, to)))
    .orderBy(desc(visits.receivedAt))
    .limit(EXPORT_ROWS + 1);

  const truncated = rows.length > EXPORT_ROWS;
  const page = truncated ? rows.slice(0, EXPORT_ROWS) : rows;

  const body = csvFile(
    [
      "visited_at",
      "received_at",
      "agent_email",
      "prospect_name",
      "outcome",
      "flyer_given",
      "follow_up_at",
      "notes",
    ],
    page.map((v) => [
      csvTimestamp(v.visitedAt),
      csvTimestamp(v.receivedAt),
      v.agentEmail,
      v.prospectName,
      v.outcome,
      v.flyerGiven,
      csvTimestamp(v.followUpAt),
      // Free text typed outdoors: commas, quotes and newlines all turn up, and
      // csvField is what keeps such a note inside one record.
      v.notes,
    ]),
    CSV_ATTRIBUTION,
  );

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": csvDisposition(csvFilename("visits", now)),
      ...(truncated ? { "x-truncated": "true" } : {}),
    },
  });
});

/* ------------------------------------------------- orphan repairs (ADR-0022) */

/**
 * The repair queue: visits the server took but could not place.
 *
 * Two reasons land a visit here (ADR-0022): its prospect does not exist, or it
 * belongs to another agent. Either way the phone has already been told the
 * visit is `accepted` and has dropped it, so this table is now the only copy —
 * which is why nothing in here is ever deleted except by an explicit admin act.
 *
 * Ordered newest first. An empty queue is the healthy state, so `remaining` is
 * a smoke alarm rather than a paging cursor: if it is ever non-zero, the answer
 * is upstream, not a bigger page.
 */
adminRoutes.get("/visits/orphaned", async (c) => {
  const db = getDb(c.env.DB);

  const held = await db
    .select()
    .from(visitsOrphaned)
    .orderBy(desc(visitsOrphaned.quarantinedAt))
    .limit(ORPHANS_PAGE_SIZE);

  const [tally] = await db.select({ total: count() }).from(visitsOrphaned);
  const remaining = Math.max(0, (tally?.total ?? 0) - held.length);

  // Candidates are drawn from every live prospect, scored in memory. The queue
  // is small by nature, but this is still a scan per request, so it is bounded
  // by the same DUPLICATES_SCAN_LIMIT the duplicate sweep uses — D1 bills rows
  // read, and an unbounded scan here would be the expensive page in the app.
  const live = held.length
    ? await db
        .select({
          id: prospects.id,
          name: prospects.name,
          address: prospects.address,
          status: prospects.status,
          assignedTo: prospects.assignedTo,
          lat: prospects.lat,
          lng: prospects.lng,
        })
        .from(prospects)
        .where(isNull(prospects.mergedInto))
        .limit(DUPLICATES_SCAN_LIMIT)
    : [];
  const byId = new Map(live.map((p) => [p.id, p]));

  const visitsOut: OrphanedVisit[] = held.map((row) => {
    const named = byId.get(row.prospectId);

    // Nearest first, and only when the visit recorded where it happened. A
    // visit with no position offers no evidence, and ranking a list in
    // arbitrary order would be worse than offering nothing.
    const at =
      typeof row.lat === "number" && typeof row.lng === "number"
        ? { lat: row.lat, lng: row.lng }
        : null;
    const candidates: OrphanCandidate[] = at
      ? live
          .flatMap((p) =>
            typeof p.lat === "number" && typeof p.lng === "number"
              ? [{ p, d: Math.round(distanceMeters(at, { lat: p.lat, lng: p.lng })) }]
              : [],
          )
          .sort((a, b) => a.d - b.d)
          .slice(0, ORPHAN_CANDIDATES)
          .map(({ p, d }) => ({
            id: p.id,
            name: p.name,
            address: p.address,
            status: p.status,
            assignedTo: p.assignedTo,
            distanceM: d,
          }))
      : [];

    return {
      id: row.id,
      prospectId: row.prospectId,
      agentEmail: row.agentEmail,
      visitedAt: row.visitedAt,
      receivedAt: row.receivedAt,
      quarantinedAt: row.quarantinedAt,
      reason: row.reason,
      flyerGiven: row.flyerGiven,
      outcome: row.outcome,
      followUpAt: row.followUpAt,
      notes: row.notes,
      prospectName: named?.name ?? null,
      candidates,
    };
  });

  const response: OrphansResponse = { visits: visitsOut, remaining };
  return c.json(response);
});

/**
 * Attach a quarantined visit to a prospect and let it count.
 *
 * One endpoint covers both reasons, because they differ only in which id the
 * admin sends: a `not_assigned` row is approved by repairing it against the
 * prospect it already named, an `unknown_prospect` row by choosing one.
 *
 * The visit keeps its original id, so a phone that somehow still holds the row
 * and resends it hits `onConflictDoNothing` and changes nothing (INVARIANT 4).
 */
adminRoutes.post(
  "/visits/orphaned/:id/repair",
  validate("param", visitIdParamSchema),
  validate("json", orphanRepairSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.valid("param");
    const { prospectId } = c.req.valid("json");
    const now = Date.now();

    const [held] = await db.select().from(visitsOrphaned).where(eq(visitsOrphaned.id, id)).limit(1);

    if (!held) {
      // Already repaired is a replay, not an error — the same reading merge
      // takes (INVARIANT 4). Distinguish it from an id that never existed.
      const [already] = await db.select({ id: visits.id }).from(visits).where(eq(visits.id, id));
      if (already) {
        const result: OrphanRepairResult = { visitId: id, prospectId, repaired: false };
        return c.json(result);
      }
      return c.json({ error: "not_found" }, 404);
    }

    const [target] = await db
      .select({ id: prospects.id, mergedInto: prospects.mergedInto })
      .from(prospects)
      .where(eq(prospects.id, prospectId))
      .limit(1);
    if (!target) {
      return c.json(
        { error: "unknown_prospect", message: "Ce prospect n'existe pas ou a été supprimé." },
        400,
      );
    }

    // Follow a merge, exactly as sync does for a dedupe collision. A prospect
    // can be absorbed in the window between a visit being quarantined and an
    // admin repairing it, and attaching the visit to the retired row would pile
    // it up on a prospect nobody looks at any more. The response reports where
    // it actually landed, so the screen is not left claiming otherwise.
    const attachTo = target.mergedInto ?? target.id;

    // The same reason sync nulls an unknown script id rather than refusing the
    // visit: the answers are still true, and a stale questionnaire reference is
    // not worth losing them over.
    let scriptId = held.scriptId;
    if (typeof scriptId === "number") {
      const [known] = await db
        .select({ id: scripts.id })
        .from(scripts)
        .where(eq(scripts.id, scriptId))
        .limit(1);
      if (!known) scriptId = null;
    }

    // D1 has no interactive transaction; a batch is one atomic unit, which is
    // what stops a crash between these two statements leaving the visit in both
    // tables or in neither.
    await db.batch([
      db
        .insert(visits)
        .values({
          id: held.id,
          prospectId: attachTo,
          agentEmail: held.agentEmail,
          // Already clamped when it was quarantined (INVARIANT 12); clamping
          // again against today's clock would rewrite history at repair time.
          visitedAt: held.visitedAt,
          clientVisitedAt: held.clientVisitedAt,
          receivedAt: held.receivedAt,
          lat: held.lat,
          lng: held.lng,
          flyerGiven: held.flyerGiven,
          outcome: held.outcome,
          followUpAt: held.followUpAt,
          notes: held.notes,
          scriptId,
          answers: held.answers,
          clientVersion: held.clientVersion,
        })
        .onConflictDoNothing(),
      db.delete(visitsOrphaned).where(eq(visitsOrphaned.id, id)),
    ]);

    await deriveProspectStatus(db, attachTo, now);

    const result: OrphanRepairResult = { visitId: id, prospectId: attachTo, repaired: true };
    return c.json(result);
  },
);

/**
 * Drop a quarantined visit for good.
 *
 * This is the one place the app deletes a visit, and it is deliberate: a row
 * whose prospect genuinely no longer exists has nowhere to go, and a queue that
 * can only grow is a queue nobody reads. INVARIANT 5 is written against
 * *silent* loss — an admin choosing this, behind a confirmation, is the
 * opposite of that. It is idempotent: discarding twice is a no-op, not a 404.
 */
adminRoutes.post(
  "/visits/orphaned/:id/discard",
  validate("param", prospectIdParamSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.valid("param");
    await db.delete(visitsOrphaned).where(eq(visitsOrphaned.id, id));
    return c.json({ discarded: id });
  },
);

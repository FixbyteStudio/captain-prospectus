/**
 * Admin routes — docs/api.md, docs/domains/prospecting.md.
 *
 * Everything here is behind `requireAdmin` (mounted in index.ts): importing,
 * editing and assigning prospects is admin-only (identity-access.md). The
 * remaining stubs answer 501 rather than pretending to succeed.
 */
import { Hono } from "hono";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { chunk } from "../../shared/chunk";
import { dedupeKey } from "../../shared/dedupe";
import {
  assignSchema,
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
  ImportResult,
  Prospect,
  ProspectsResponse,
} from "../../shared/schemas";
import { parseEmails, roleFor } from "../auth";
import { validate } from "../validate";
import { boundParamsPerRow, getDb } from "../db/client";
import { prospects } from "../db/schema";
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
    status ? eq(prospects.status, status) : undefined,
    assignedTo ? eq(prospects.assignedTo, assignedTo) : undefined,
    source ? eq(prospects.source, source) : undefined,
  ].filter((f) => f !== undefined);
  const where = filters.length > 0 ? and(...filters) : undefined;

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

/* ------------------------------------------------------------ not yet built */

adminRoutes.post("/import/overpass", validate("json", overpassImportSchema), (c) =>
  c.json(notYet("M4"), 501),
);

adminRoutes.get("/visits", (c) => c.json(notYet("M4"), 501));

adminRoutes.get("/scripts", (c) => c.json(notYet("M3"), 501));

adminRoutes.post("/scripts", validate("json", scriptCreateSchema), (c) =>
  c.json(notYet("M3"), 501),
);

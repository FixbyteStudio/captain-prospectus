/**
 * Agent routes — docs/domains/field-operations.md, ADR-0007.
 *
 * One endpoint does the work: push the phone's outbox, pull its today list.
 * Everything here is insert-only and idempotent, because a phone may resend a
 * payload any number of times (INVARIANT 4).
 */
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  MIN_CLIENT_VERSION,
  OPEN_STATUSES,
  OUTCOME_TO_STATUS,
  VISIT_HISTORY_LIMIT,
} from "../../shared/constants";
import { chunk } from "../../shared/chunk";
import { dedupeKey } from "../../shared/dedupe";
import { prospectIdParamSchema, syncRequestSchema } from "../../shared/schemas";
import type { Prospect, SyncResponse, VisitHistoryResponse } from "../../shared/schemas";
import { validate } from "../validate";
import { boundParamsPerRow, getDb } from "../db/client";
import { prospects, scripts, visits } from "../db/schema";
import { toWireScript } from "./wire";
import type { AppEnv } from "../types";
import type { NewProspectRow, NewVisitRow, ProspectRow } from "../db/schema";

export const agentRoutes = new Hono<AppEnv>();

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

/**
 * Runs BEFORE validation, on purpose.
 *
 * A build old enough to be unsupported may also send a payload that no longer
 * matches the current schema. Validating first would answer 400 "your data is
 * wrong", when the true answer is 426 "update the app" — and the difference
 * matters, because only one of those tells the client its outbox is fine
 * (INVARIANT 5). Hono caches the parsed body, so this costs no second parse.
 */
const requireSupportedClientVersion = createMiddleware<AppEnv>(async (c, next) => {
  const body: unknown = await c.req.json().catch(() => null);
  const version = (body as { clientVersion?: unknown } | null)?.clientVersion;

  if (typeof version === "number" && version < MIN_CLIENT_VERSION) {
    return c.json(
      {
        error: "client_too_old",
        message: "Mettez l'application à jour pour synchroniser.",
        minClientVersion: MIN_CLIENT_VERSION,
      },
      426,
    );
  }
  return next();
});

agentRoutes.post(
  "/sync",
  requireSupportedClientVersion,
  validate("json", syncRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    const { email } = c.get("identity");
    const db = getDb(c.env.DB);
    const now = Date.now();

    // ---- 1. Field prospects first: a visit in this payload may reference one.
    const idMap: Record<string, string> = {};
    const acceptedProspects: string[] = [];

    if (body.prospects.length > 0) {
      const rows: NewProspectRow[] = body.prospects.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        address: p.address ?? null,
        phone: p.phone ?? null,
        website: null,
        cuisine: null,
        source: "field" as const,
        sourceRef: null,
        dedupeKey: dedupeKey({ name: p.name, lat: p.lat, lng: p.lng, address: p.address }),
        // A field prospect belongs to the agent who found it.
        status: "assigned" as const,
        assignedTo: email,
        createdBy: email,
        createdAt: p.createdAt,
        updatedAt: now,
      }));

      for (const batch of chunk(rows, boundParamsPerRow(prospects))) {
        await db.insert(prospects).values(batch).onConflictDoNothing();
      }

      // Dedupe collisions: the place already existed, so the existing row wins and
      // the client is told which id to use instead.
      //
      // mergedInto is followed here: if the row the key lands on has since been
      // merged away, the phone must be pointed at the survivor, or its visits
      // would pile up on a prospect the admin has already retired.
      const keys = rows.map((r) => r.dedupeKey);
      const existing = await db
        .select({
          id: prospects.id,
          dedupeKey: prospects.dedupeKey,
          mergedInto: prospects.mergedInto,
        })
        .from(prospects)
        .where(inArray(prospects.dedupeKey, keys));
      const byKey = new Map(existing.map((r) => [r.dedupeKey, r.mergedInto ?? r.id]));

      for (const row of rows) {
        const serverId = byKey.get(row.dedupeKey);
        if (!serverId) continue;
        if (serverId !== row.id) idMap[row.id] = serverId;
        // Accepted either way: the client's outbox row is done with.
        acceptedProspects.push(row.id);
      }
    }

    // ---- 2. Visits, with the collision map applied.
    const acceptedVisits: string[] = [];
    const touchedProspectIds = new Set<string>();
    /** prospect id -> its assignee, for the status rule in step 3 (ADR-0021). */
    const assigneeById = new Map<string, string | null>();

    if (body.visits.length > 0) {
      const rows: NewVisitRow[] = body.visits.map((v) => {
        const prospectId = idMap[v.prospectId] ?? v.prospectId;
        return {
          id: v.id,
          prospectId,
          agentEmail: email,
          // INVARIANT 12: a phone's clock can be ahead. An unclamped future date
          // would win every later comparison and freeze this prospect's status.
          visitedAt: Math.min(v.visitedAt, now),
          clientVisitedAt: v.visitedAt,
          receivedAt: now,
          lat: v.lat ?? null,
          lng: v.lng ?? null,
          flyerGiven: v.flyerGiven,
          outcome: v.outcome,
          followUpAt: v.followUpAt ?? null,
          notes: v.notes ?? null,
          scriptId: v.scriptId ?? null,
          answers: v.answers,
          clientVersion: body.clientVersion,
        };
      });

      // Only insert visits whose prospect exists: a foreign-key failure would
      // reject the whole statement and cost the agent every visit in the batch.
      const referenced = [...new Set(rows.map((r) => r.prospectId))];
      // assigned_to comes back with the id because step 3 needs it: a visit only
      // moves a prospect it belongs to (ADR-0021). Reading it here costs nothing
      // — it is the same row — and saves a query per prospect below.
      for (const row of await db
        .select({ id: prospects.id, assignedTo: prospects.assignedTo })
        .from(prospects)
        .where(inArray(prospects.id, referenced))) {
        assigneeById.set(row.id, row.assignedTo);
      }
      const insertable = rows.filter((r) => assigneeById.has(r.prospectId));

      // `visits.script_id` is a foreign key too, and a phone can hold a visit
      // answered against a script this database does not have — a build that
      // synced from another environment, or a row restored from a backup taken
      // before it. The prospect filter above drops the visit; doing that here
      // would be wrong, because the visit itself is still true. So the unknown
      // id is nulled and the answers are kept: INVARIANT 5 says never lose a
      // visit, and losing one to a stale questionnaire reference is still
      // losing one. Rejecting it instead would strand the row in the outbox for
      // ever, which is docs/backlog/003.
      const referencedScripts = [
        ...new Set(
          insertable.map((r) => r.scriptId).filter((id): id is number => typeof id === "number"),
        ),
      ];
      if (referencedScripts.length > 0) {
        const knownScripts = new Set(
          (
            await db
              .select({ id: scripts.id })
              .from(scripts)
              .where(inArray(scripts.id, referencedScripts))
          ).map((r) => r.id),
        );
        for (const row of insertable) {
          if (typeof row.scriptId === "number" && !knownScripts.has(row.scriptId)) {
            row.scriptId = null;
          }
        }
      }

      for (const batch of chunk(insertable, boundParamsPerRow(visits))) {
        const inserted = await db
          .insert(visits)
          .values(batch)
          .onConflictDoNothing()
          .returning({ id: visits.id, prospectId: visits.prospectId });
        for (const row of inserted) touchedProspectIds.add(row.prospectId);
      }

      // Idempotency: a visit already stored counts as accepted, so a retry lets
      // the client clear its outbox instead of resending forever.
      for (const row of insertable) acceptedVisits.push(row.id);
    }

    // ---- 3. Derive prospect status from the newly stored visits (INVARIANT 3).
    for (const prospectId of touchedProspectIds) {
      const [latest] = await db
        .select({
          outcome: visits.outcome,
          visitedAt: visits.visitedAt,
          followUpAt: visits.followUpAt,
          agentEmail: visits.agentEmail,
        })
        .from(visits)
        .where(eq(visits.prospectId, prospectId))
        .orderBy(desc(visits.visitedAt))
        .limit(1);
      if (!latest) continue;

      // ADR-0021: a visit is stored and accepted whoever wrote it, but only the
      // assignee's visit moves the prospect. Without this, any agent past Access
      // could post `not_interested` against any prospect id and drop it out of
      // OPEN_STATUSES — off the other agent's today list and out of the admin's
      // open workload (#33).
      //
      // The honest cost is the reassignment race: an agent visits, the admin
      // reassigns while the phone is offline, and that real visit then does not
      // move the prospect. It is still stored and still attributed, and the live
      // feed shows agent_email beside assigned_to, so the admin can set the
      // status by hand (ADR-0011 allows that). Losing the visit instead would
      // breach INVARIANT 5, which is the trade the ADR makes deliberately.
      //
      // An unassigned prospect has no assignee, so nothing derives. Agents never
      // pull one — the today list filters on assigned_to = email.
      if (latest.agentEmail !== assigneeById.get(prospectId)) continue;

      // Only the latest visit moves the status; a late-syncing older visit is
      // stored but does not overwrite a newer outcome.
      await db
        .update(prospects)
        .set({
          status: OUTCOME_TO_STATUS[latest.outcome],
          lastVisitAt: latest.visitedAt,
          nextVisitAt: latest.followUpAt,
          updatedAt: now,
        })
        .where(eq(prospects.id, prospectId));
    }

    // ---- 4. Pull: the agent's open, live prospects and the active script.
    // A merged prospect is gone as far as the round is concerned — that is the
    // whole point of merging, so the agent stops walking to the same door twice.
    const todayList = await db
      .select()
      .from(prospects)
      .where(
        and(
          eq(prospects.assignedTo, email),
          inArray(prospects.status, [...OPEN_STATUSES]),
          isNull(prospects.mergedInto),
        ),
      );

    const [activeScript] = await db
      .select()
      .from(scripts)
      .where(eq(scripts.isActive, true))
      .limit(1);

    const response: SyncResponse = {
      serverTime: now,
      accepted: { prospects: acceptedProspects, visits: acceptedVisits },
      idMap,
      prospects: todayList.map(toWireProspect),
      script: activeScript ? toWireScript(activeScript) : null,
    };
    return c.json(response);
  },
);

/**
 * Last 20 visits of a prospect. An agent sees only prospects assigned to them.
 *
 * The visit form shows these as « Visites précédentes », so an agent knows what
 * happened last time before knocking (field-operations.md).
 */
agentRoutes.get("/prospects/:id/visits", validate("param", prospectIdParamSchema), async (c) => {
  const db = getDb(c.env.DB);
  const { email, role } = c.get("identity");
  const { id } = c.req.valid("param");

  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, id)).limit(1);
  if (!prospect) return c.json({ error: "not_found" }, 404);
  if (role !== "admin" && prospect.assignedTo !== email) {
    return c.json({ error: "forbidden", message: "Ce prospect ne vous est pas assigné." }, 403);
  }

  // Only the columns the contract declares. The row also carries clock-skew
  // and upgrade diagnostics, which are nobody's business at a doorstep.
  const history = await db
    .select({
      id: visits.id,
      prospectId: visits.prospectId,
      agentEmail: visits.agentEmail,
      visitedAt: visits.visitedAt,
      flyerGiven: visits.flyerGiven,
      outcome: visits.outcome,
      followUpAt: visits.followUpAt,
      notes: visits.notes,
    })
    .from(visits)
    .where(eq(visits.prospectId, id))
    .orderBy(desc(visits.visitedAt))
    .limit(VISIT_HISTORY_LIMIT);

  const response: VisitHistoryResponse = { visits: history };
  return c.json(response);
});

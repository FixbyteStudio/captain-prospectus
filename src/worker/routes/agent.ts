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
import { MIN_CLIENT_VERSION, OPEN_STATUSES, VISIT_HISTORY_LIMIT } from "../../shared/constants";
import { chunk } from "../../shared/chunk";
import { dedupeKey } from "../../shared/dedupe";
import { prospectIdParamSchema, syncRequestSchema } from "../../shared/schemas";
import type { Prospect, SyncResponse, VisitHistoryResponse } from "../../shared/schemas";
import type { OrphanReason } from "../../shared/constants";
import { validate } from "../validate";
import { boundParamsPerRow, getDb } from "../db/client";
import { prospects, scripts, visits, visitsOrphaned } from "../db/schema";
import { deriveProspectStatus } from "./status";
import { toWireScript } from "./wire";
import type { AppEnv } from "../types";
import type { NewOrphanedVisitRow, NewProspectRow, NewVisitRow, ProspectRow } from "../db/schema";

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
      //
      // Chunked because one key binds one parameter and the schema's cap on
      // prospects is exactly D1's 100: raising that cap would otherwise break
      // this statement silently (#30, INVARIANT 7).
      const keys = rows.map((r) => r.dedupeKey);
      const byKey = new Map<string, string>();
      for (const keyBatch of chunk(keys, 1)) {
        const existing = await db
          .select({
            id: prospects.id,
            dedupeKey: prospects.dedupeKey,
            mergedInto: prospects.mergedInto,
          })
          .from(prospects)
          .where(inArray(prospects.dedupeKey, keyBatch));
        for (const r of existing) byKey.set(r.dedupeKey, r.mergedInto ?? r.id);
      }

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

      // One lookup answers both questions the partition below asks: does the
      // prospect exist, and whose is it.
      //
      // It is chunked: a batch may name up to SYNC_VISITS_PER_REQUEST distinct
      // prospects, one bound parameter each. Unchunked, an agent with more than
      // 100 doors to report got a 500 that left the outbox full and never
      // drained (#30, INVARIANT 7).
      const referenced = [...new Set(rows.map((r) => r.prospectId))];
      for (const batch of chunk(referenced, 1)) {
        for (const row of await db
          .select({ id: prospects.id, assignedTo: prospects.assignedTo })
          .from(prospects)
          .where(inArray(prospects.id, batch))) {
          assigneeById.set(row.id, row.assignedTo);
        }
      }

      // ADR-0022: a visit the server cannot take as sent is quarantined rather
      // than dropped or refused.
      //
      //   unknown_prospect — prospect_id resolves to nothing. It cannot go in
      //     `visits` at all; the foreign key would fail and take the whole
      //     statement, costing the agent every visit in the batch.
      //   not_assigned — the prospect exists but is somebody else's. Letting it
      //     through let either agent flip any prospect's status (#33).
      //
      // Both are still reported in `accepted`, because the server really has
      // taken them. That is what stops the phone resending for ever, which is
      // the half of this INVARIANT 5 used to make impossible to fix.
      const insertable: NewVisitRow[] = [];
      const quarantined: NewOrphanedVisitRow[] = [];
      for (const row of rows) {
        const assignee = assigneeById.get(row.prospectId);
        const reason: OrphanReason | null = !assigneeById.has(row.prospectId)
          ? "unknown_prospect"
          : assignee !== email
            ? "not_assigned"
            : null;
        if (reason) quarantined.push({ ...row, reason, quarantinedAt: now });
        else insertable.push(row);
      }

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
        // Chunked for the same reason as the prospect lookup above: the ids come
        // off the payload, so a client can name more than 100 of them (#30).
        const knownScripts = new Set<number>();
        for (const batch of chunk(referencedScripts, 1)) {
          for (const r of await db
            .select({ id: scripts.id })
            .from(scripts)
            .where(inArray(scripts.id, batch))) {
            knownScripts.add(r.id);
          }
        }
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

      for (const batch of chunk(quarantined, boundParamsPerRow(visitsOrphaned))) {
        await db.insert(visitsOrphaned).values(batch).onConflictDoNothing();
      }

      // Idempotency: a visit already stored counts as accepted, so a retry lets
      // the client clear its outbox instead of resending forever. A quarantined
      // one counts too — `accepted` means the server has durably taken the
      // visit, not that a row exists in `visits` (ADR-0022).
      for (const row of insertable) acceptedVisits.push(row.id);
      for (const row of quarantined) acceptedVisits.push(row.id);
    }

    // ---- 3. Derive prospect status from the newly stored visits (INVARIANT 3).
    // Quarantined visits are deliberately absent from touchedProspectIds: they
    // have no settled prospect yet, and derive nothing until repaired.
    for (const prospectId of touchedProspectIds) {
      await deriveProspectStatus(db, prospectId, now);
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

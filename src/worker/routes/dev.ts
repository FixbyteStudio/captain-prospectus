/**
 * Local development only. Mounted solely when the request host is localhost and
 * DEV_USER_EMAIL is set, exactly like the identity bypass it borrows its gate
 * from (docs/domains/identity-access.md).
 *
 * Seeding goes through the real insert path — dedupe keys, chunking, status
 * derivation — so the local database matches what production would hold, and
 * `wrangler d1 execute` never needs to be run by hand.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { chunk } from "../../shared/chunk";
import { CLIENT_VERSION } from "../../shared/constants";
import { dedupeKey } from "../../shared/dedupe";
import { devSeedSchema } from "../../shared/schemas";
import type { DevSeed, DevSeedResult } from "../../shared/schemas";
import { isLocalHost } from "../auth";
import { validate } from "../validate";
import { boundParamsPerRow, getDb } from "../db/client";
import { prospects, scripts, visits, visitsOrphaned } from "../db/schema";
import type { NewOrphanedVisitRow, NewProspectRow, NewVisitRow } from "../db/schema";
import { FIXED_STORIES, seedDayStart, seedHistory, seedId } from "../dev-seed-history";
import type { AppEnv } from "../types";
import { deriveProspectStatus } from "./status";

const HOUR = 3_600_000;

export const devRoutes = new Hono<AppEnv>();

/**
 * Two conditions, not one.
 *
 * The hostname comes from a header we do not control, so on its own it is a
 * claim rather than a fact. DEV_USER_EMAIL is ours: it is set in .dev.vars and
 * never in production, which is what makes this route unreachable there even if
 * a Host ever arrived that satisfied the first half.
 *
 * Runs as middleware rather than inside the handler so an off-localhost request
 * is refused before a body is read at all.
 */
const devOnly = createMiddleware<AppEnv>(async (c, next) => {
  const url = new URL(c.req.url);
  if (!isLocalHost(url.hostname)) return c.json({ error: "not_found" }, 404);
  if (!c.env.DEV_USER_EMAIL) {
    // Localhost only: saying why is a help to a developer on a fresh clone, and
    // it reaches nobody else.
    return c.json(
      {
        error: "not_found",
        message: "Set DEV_USER_EMAIL in .dev.vars to use the dev routes.",
      },
      404,
    );
  }
  return next();
});

devRoutes.use("*", devOnly);

devRoutes.post("/seed", validate("json", devSeedSchema), async (c) => {
  const body = c.req.valid("json");
  const db = getDb(c.env.DB);
  const now = Date.now();

  // 1. The prospects. Ids are hashed from the dedupe key, like every seeded id.
  const seeds: Seed[] = body.prospects.map((input) => ({
    input,
    key: dedupeKey({ name: input.name, lat: input.lat, lng: input.lng, address: input.address }),
  }));
  const rows: NewProspectRow[] = seeds.map(({ input: p, key }) => {
    return {
      id: seedId(`prospect:${key}`),
      name: p.name,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      phone: null,
      website: null,
      cuisine: null,
      source: "csv" as const,
      sourceRef: null,
      dedupeKey: key,
      status: p.assignedTo ? ("assigned" as const) : ("new" as const),
      assignedTo: p.assignedTo,
      createdBy: "seed@localhost",
      createdAt: now,
      updatedAt: now,
    };
  });

  let insertedProspects = 0;
  for (const batch of chunk(rows, boundParamsPerRow(prospects))) {
    const inserted = await db
      .insert(prospects)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: prospects.id });
    insertedProspects += inserted.length;
  }

  // 2. What the database holds under each key: a row seeded before ids were
  // hashed, or reassigned by an admin since, wins over the body.
  const stored = new Map<string, StoredProspect>();
  for (const batch of chunk(
    seeds.map((s) => s.key),
    1,
  )) {
    for (const row of await db
      .select({
        id: prospects.id,
        dedupeKey: prospects.dedupeKey,
        assignedTo: prospects.assignedTo,
        mergedInto: prospects.mergedInto,
        lat: prospects.lat,
        lng: prospects.lng,
      })
      .from(prospects)
      .where(inArray(prospects.dedupeKey, batch))) {
      stored.set(row.dedupeKey, row);
    }
  }

  // 3. The script.
  await db
    .insert(scripts)
    .values({
      name: body.script.name,
      version: 1,
      questions: body.script.questions,
      isActive: true,
      createdAt: now,
    })
    .onConflictDoNothing();

  // 4. The histories. The fixed stories go to each agent's first prospects in
  // this request — counted per request, so every batch seed.mjs sends gets its
  // own — skipping those with a merge or a manual status, which could undo one.
  const storiesTaken = new Map<string, number>();
  const history: NewVisitRow[] = [];
  for (const { input: p, key } of seeds) {
    const row = stored.get(key);
    if (!row || p.manualStatus !== undefined) continue;
    let story: number | null = null;
    if (row.assignedTo !== null && p.mergeInto === undefined) {
      const taken = storiesTaken.get(row.assignedTo) ?? 0;
      if (taken < FIXED_STORIES.length) {
        story = taken;
        storiesTaken.set(row.assignedTo, taken + 1);
      }
    }
    history.push(...seedHistory({ ...row, story }, now));
  }

  let insertedVisits = 0;
  const touchedProspectIds = new Set<string>();
  for (const batch of chunk(history, boundParamsPerRow(visits))) {
    const inserted = await db
      .insert(visits)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: visits.id, prospectId: visits.prospectId });
    insertedVisits += inserted.length;
    for (const row of inserted) touchedProspectIds.add(row.prospectId);
  }

  // 5. Status from visits, by the one function sync uses (INVARIANT 3). Only
  // for visits this call inserted, as sync does: a re-seed that inserts nothing
  // leaves `updated_at`, and so the admin list's order, alone.
  for (const prospectId of touchedProspectIds) {
    await deriveProspectStatus(db, prospectId, now);
  }

  // 6. The manual status and the merge, each written only while unset: a status
  // an admin has since set by hand is kept, but a prospect they have unmerged
  // has `merged_into` null again, so a re-seed merges it again.
  const yesterdayAfternoon = seedDayStart(now, 1) + 14 * HOUR;
  for (const { input: p, key } of seeds) {
    const row = stored.get(key);
    if (!row) continue;
    if (p.manualStatus !== undefined) {
      await db
        .update(prospects)
        .set({ status: p.manualStatus, statusSetAt: yesterdayAfternoon, updatedAt: now })
        .where(and(eq(prospects.id, row.id), isNull(prospects.statusSetAt)));
    }
    if (p.mergeInto !== undefined) {
      // devSeedSchema has already checked that this name is in the body.
      const targetSeed = seeds.find((s) => s.input.name === p.mergeInto);
      const target = targetSeed && stored.get(targetSeed.key);
      if (!target || target.mergedInto !== null) continue;
      await db
        .update(prospects)
        .set({ mergedInto: target.id, updatedAt: now })
        .where(and(eq(prospects.id, row.id), isNull(prospects.mergedInto)));
    }
  }

  // 7. One quarantined visit of each reason, shaped as sync writes them.
  const orphans = seedOrphans(seeds, stored, c.env.DEV_USER_EMAIL, now);
  let insertedOrphans = 0;
  if (orphans.length > 0) {
    // A repaired orphan now lives in `visits`; quarantining it again would
    // hand the admin the same visit twice.
    const repaired = new Set(
      (
        await db
          .select({ id: visits.id })
          .from(visits)
          .where(
            inArray(
              visits.id,
              orphans.map((o) => o.id),
            ),
          )
      ).map((r) => r.id),
    );
    const pending = orphans.filter((o) => !repaired.has(o.id));
    for (const batch of chunk(pending, boundParamsPerRow(visitsOrphaned))) {
      const inserted = await db
        .insert(visitsOrphaned)
        .values(batch)
        .onConflictDoNothing()
        .returning({ id: visitsOrphaned.id });
      insertedOrphans += inserted.length;
    }
  }

  return c.json<DevSeedResult>({
    seeded: rows.length,
    inserted: { prospects: insertedProspects, visits: insertedVisits, orphans: insertedOrphans },
  });
});

type Seed = { input: DevSeed["prospects"][number]; key: string };

type StoredProspect = {
  id: string;
  dedupeKey: string;
  assignedTo: string | null;
  mergedInto: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * In dev, sync always runs as DEV_USER_EMAIL, so it cannot post another
 * agent's visit to produce either reason — hence written here directly
 * (ADR-0022 describes the two). Constant ids: one of each, however often this runs.
 */
function seedOrphans(
  seeds: readonly Seed[],
  stored: ReadonlyMap<string, StoredProspect>,
  devUser: string | undefined,
  now: number,
): NewOrphanedVisitRow[] {
  const live = seeds.flatMap(({ input, key }) => {
    const row = stored.get(key);
    return row && row.mergedInto === null && input.mergeInto === undefined ? [row] : [];
  });
  const agents = [
    ...new Set(
      [...live.map((r) => r.assignedTo), devUser ?? null].filter(
        (a): a is string => typeof a === "string",
      ),
    ),
  ];

  const visitedAt = Math.min(seedDayStart(now, 1) + 11 * HOUR, now);
  const receivedAt = Math.min(visitedAt + 20 * 60_000, now);
  const base = {
    visitedAt,
    clientVisitedAt: visitedAt,
    receivedAt,
    flyerGiven: false,
    // Both outcomes below take a follow-up, as the generator's do; a repaired
    // orphan then leaves its prospect with a `next_visit_at`.
    followUpAt: seedDayStart(now, -3) + 10 * HOUR,
    notes: null,
    scriptId: null,
    answers: {},
    clientVersion: CLIENT_VERSION,
    quarantinedAt: receivedAt,
  };

  const orphans: NewOrphanedVisitRow[] = [];

  // Someone else's prospect: the visit names it, and the admin only approves.
  for (const prospect of live) {
    const intruder = agents.find((a) => a !== prospect.assignedTo);
    if (prospect.assignedTo === null || intruder === undefined) continue;
    orphans.push({
      ...base,
      id: seedId("orphan:not_assigned"),
      prospectId: prospect.id,
      agentEmail: intruder,
      lat: prospect.lat,
      lng: prospect.lng,
      outcome: "interested",
      reason: "not_assigned",
    });
    break;
  }

  // A prospect this database never had, e.g. created on a phone that lost it.
  const [agent] = agents;
  if (agent !== undefined) {
    orphans.push({
      ...base,
      id: seedId("orphan:unknown_prospect"),
      prospectId: seedId("orphan:unknown_prospect:prospect"),
      agentEmail: agent,
      lat: live[0]?.lat ?? null,
      lng: live[0]?.lng ?? null,
      outcome: "no_contact",
      reason: "unknown_prospect",
    });
  }
  return orphans;
}

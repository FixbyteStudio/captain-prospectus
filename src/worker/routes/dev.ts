/**
 * Local development only. Mounted solely when the request host is localhost and
 * DEV_USER_EMAIL is set, exactly like the identity bypass it borrows its gate
 * from (docs/domains/identity-access.md).
 *
 * Seeding goes through the real insert path — dedupe keys, chunking, status
 * derivation — so the local database matches what production would hold, and
 * `wrangler d1 execute` never needs to be run by hand.
 */
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { chunk } from "../../shared/chunk";
import { dedupeKey } from "../../shared/dedupe";
import { devSeedSchema } from "../../shared/schemas";
import { isLocalHost } from "../auth";
import { validate } from "../validate";
import { boundParamsPerRow, getDb } from "../db/client";
import { prospects, scripts } from "../db/schema";
import type { NewProspectRow } from "../db/schema";
import type { AppEnv } from "../types";

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

  const rows: NewProspectRow[] = body.prospects.map((p) => ({
    id: crypto.randomUUID(),
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
    dedupeKey: dedupeKey({ name: p.name, lat: p.lat, lng: p.lng, address: p.address }),
    status: p.assignedTo ? ("assigned" as const) : ("new" as const),
    assignedTo: p.assignedTo,
    createdBy: "seed@localhost",
    createdAt: now,
    updatedAt: now,
  }));

  for (const batch of chunk(rows, boundParamsPerRow(prospects))) {
    await db.insert(prospects).values(batch).onConflictDoNothing();
  }

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

  return c.json({ seeded: rows.length });
});

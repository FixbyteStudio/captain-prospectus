/**
 * Local development only. Mounted solely when the request host is localhost,
 * exactly like DEV_USER_EMAIL (docs/domains/identity-access.md).
 *
 * Seeding goes through the real insert path — dedupe keys, chunking, status
 * derivation — so the local database matches what production would hold, and
 * `wrangler d1 execute` never needs to be run by hand.
 */
import { Hono } from "hono";
import { chunk } from "../../shared/chunk";
import { dedupeKey } from "../../shared/dedupe";
import { boundParamsPerRow, getDb } from "../db/client";
import { prospects, scripts } from "../db/schema";
import type { NewProspectRow } from "../db/schema";
import type { AppEnv } from "../types";

export const devRoutes = new Hono<AppEnv>();

type SeedBody = {
  prospects: {
    name: string;
    type: NewProspectRow["type"];
    lat: number | null;
    lng: number | null;
    address: string | null;
    assignedTo: string | null;
  }[];
  script: { name: string; questions: unknown[] };
};

devRoutes.post("/seed", async (c) => {
  const url = new URL(c.req.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return c.json({ error: "not_found" }, 404);
  }

  const body = (await c.req.json()) as SeedBody;
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

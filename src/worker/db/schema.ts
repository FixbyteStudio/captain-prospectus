/**
 * The system of record. docs/data-model.md explains it; this file defines it.
 *
 * Timestamps are epoch-millisecond integers. Ids created on a phone are client
 * UUIDv4. Change this file, then `pnpm db:generate` — never hand-edit a
 * migration that is already on main.
 */
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { OUTCOMES, PROSPECT_TYPES, SOURCES, STATUSES } from "../../shared/constants";

export const prospects = sqliteTable(
  "prospects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type", { enum: PROSPECT_TYPES }).notNull().default("other"),
    lat: real("lat"),
    lng: real("lng"),
    address: text("address"),
    phone: text("phone"),
    website: text("website"),
    cuisine: text("cuisine"),

    source: text("source", { enum: SOURCES }).notNull(),
    /** Stable id from the source, e.g. the OSM element "node/123". */
    sourceRef: text("source_ref"),
    /** Unique. Computed server-side; see src/shared/dedupe.ts. */
    dedupeKey: text("dedupe_key").notNull(),

    status: text("status", { enum: STATUSES }).notNull().default("new"),
    /** Agent email, or null when unassigned. Zero or one agent per prospect. */
    assignedTo: text("assigned_to"),

    lastVisitAt: integer("last_visit_at"),
    nextVisitAt: integer("next_visit_at"),

    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("prospects_dedupe_key_idx").on(t.dedupeKey),
    index("prospects_assigned_status_idx").on(t.assignedTo, t.status),
    index("prospects_status_idx").on(t.status),
    // The admin list filters by source and orders by updatedAt. Without these
    // both are full scans, and D1's free tier bills scanned rows.
    index("prospects_source_idx").on(t.source),
    index("prospects_updated_idx").on(t.updatedAt),
  ],
);

/**
 * Append-only. Never updated, never deleted by the app; a revisit is a new row.
 */
export const visits = sqliteTable(
  "visits",
  {
    /** Generated on the phone with crypto.randomUUID(), so retries are no-ops. */
    id: text("id").primaryKey(),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospects.id),
    agentEmail: text("agent_email").notNull(),

    /**
     * When the visit happened, CLAMPED to min(clientVisitedAt, receivedAt).
     * INVARIANT 12: phone clocks can be wrong, and a future-dated visit would
     * win every later comparison and freeze the prospect's status forever.
     */
    visitedAt: integer("visited_at").notNull(),
    /** The raw phone clock value, unclamped, so skew stays visible. */
    clientVisitedAt: integer("client_visited_at").notNull(),
    /** Server clock. The live feed orders by this; history orders by visitedAt. */
    receivedAt: integer("received_at").notNull(),

    lat: real("lat"),
    lng: real("lng"),
    flyerGiven: integer("flyer_given", { mode: "boolean" }).notNull().default(false),
    outcome: text("outcome", { enum: OUTCOMES }).notNull(),
    followUpAt: integer("follow_up_at"),
    notes: text("notes"),

    /** The exact script version answered, so answers stay interpretable. */
    scriptId: integer("script_id").references(() => scripts.id),
    answers: text("answers", { mode: "json" })
      .notNull()
      .default(sql`'{}'`),

    /**
     * Sync contract version of the build that sent this visit. Makes
     * "have all phones upgraded?" a query rather than a log search, which is
     * the gate for raising MIN_CLIENT_VERSION.
     */
    clientVersion: integer("client_version").notNull(),
  },
  (t) => [
    index("visits_prospect_visited_idx").on(t.prospectId, t.visitedAt),
    index("visits_received_idx").on(t.receivedAt),
    index("visits_agent_visited_idx").on(t.agentEmail, t.visitedAt),
  ],
);

/** Immutable per version. Editing a script creates version N+1 and activates it. */
export const scripts = sqliteTable(
  "scripts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    questions: text("questions", { mode: "json" }).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("scripts_active_idx").on(t.isActive)],
);

/** Overpass responses, keyed by a hash of the normalised polygon. TTL 7 days. */
export const overpassCache = sqliteTable("overpass_cache", {
  hash: text("hash").primaryKey(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type ProspectRow = typeof prospects.$inferSelect;
export type NewProspectRow = typeof prospects.$inferInsert;
export type VisitRow = typeof visits.$inferSelect;
export type NewVisitRow = typeof visits.$inferInsert;
export type ScriptRow = typeof scripts.$inferSelect;

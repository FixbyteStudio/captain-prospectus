/**
 * The wire contract. INVARIANT 6: every request body is validated with a schema
 * from this file. No inline ad-hoc validation in routes.
 *
 * JSON is camelCase, SQL is snake_case (Drizzle maps them). Timestamps are
 * epoch-millisecond integers.
 *
 * **Why `zod/mini` and not `zod`.** This module is reachable from the field
 * entry chunk — `sync.ts` validates the server's response before trusting it
 * enough to clear an outbox row (INVARIANT 5), so the schemas an agent's phone
 * downloads are not optional. Classic zod's runtime is ~27.8 kB gzipped of that
 * chunk, ~5.5 kB of which is JSON-Schema conversion this app never calls; the
 * mini runtime is ~8 kB for the same contract. ADR-0017 has the measurement.
 *
 * The cost is the API: mini composes with `.check(...)` and standalone wrappers
 * (`z.optional(x)`, `z.nullable(x)`, `z._default(x, v)`) where classic chains
 * methods. Same core, same parsed values, same `issues` shape — `@hono/zod-validator`
 * takes a mini schema because both are `$ZodType` — so this is one definition
 * serving both sides, which is the whole point of `src/shared`.
 */
import * as z from "zod/mini";
import {
  ADMIN_VISITS_PAGE_SIZE,
  DASHBOARD_DEFAULT_PERIOD,
  DASHBOARD_PERIODS,
  EXPORT_DEFAULT_WINDOW_MS,
  IMPORT_ROWS_PER_REQUEST,
  ORPHAN_CANDIDATES,
  ORPHAN_REASONS,
  ORPHANS_PAGE_SIZE,
  OVERPASS_CANDIDATES_LIMIT,
  PLACES_RADIUS_MAX_M,
  PLACES_RADIUS_MIN_M,
  PROSPECTS_MAX_OFFSET,
  PROSPECTS_PAGE_SIZE,
  OUTCOMES,
  POLYGON_MAX_VERTICES,
  POLYGON_MIN_VERTICES,
  PROSPECT_TYPES,
  QUESTION_TYPES,
  ROLES,
  STATUSES,
  SOURCES,
  SYNC_PROSPECTS_PER_REQUEST,
  SYNC_VISITS_PER_REQUEST,
} from "./constants";

/* ---------------------------------------------------------------- primitives */

export const uuidSchema = z.uuid();
export const epochMsSchema = z.int().check(z.nonnegative());
export const latSchema = z.number().check(z.gte(-90), z.lte(90));
export const lngSchema = z.number().check(z.gte(-180), z.lte(180));
/**
 * `z.overwrite`, not `z.lowercase()`: the classic schema called `.toLowerCase()`,
 * which normalises. `z.lowercase()` is a *check* that would reject `A@b.com`
 * instead of folding it, and an admin typing a capital into the assign box is
 * not an error to report.
 */
export const emailSchema = z.email().check(
  z.overwrite((value) => value.toLowerCase()),
  z.maxLength(320),
);

/** Free text from the field or an import. Capped so a payload cannot balloon. */
const shortText = z.string().check(z.trim(), z.maxLength(200));
const longText = z.string().check(z.trim(), z.maxLength(2000));
/** `shortText` that may not be empty. Mini's `.check()` clones and appends. */
const shortTextRequired = shortText.check(z.minLength(1));

export const statusSchema = z.enum(STATUSES);
export const outcomeSchema = z.enum(OUTCOMES);
export const prospectTypeSchema = z.enum(PROSPECT_TYPES);
export const sourceSchema = z.enum(SOURCES);
export const roleSchema = z.enum(ROLES);

/* --------------------------------------------------------------------- /api/me */

export const meResponseSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/* -------------------------------------------------------------------- scripts */

/** The types whose answer is one of `options`, so `options` must be there. */
const TYPES_WITH_OPTIONS: ReadonlySet<string> = new Set(["single", "multi"]);

export const questionSchema = z
  .object({
    key: z
      .string()
      .check(
        z.regex(/^[a-z][a-z0-9_]*$/, "key must be snake_case and start with a letter"),
        z.maxLength(60),
      ),
    label: shortTextRequired,
    type: z.enum(QUESTION_TYPES),
    options: z.optional(z.array(shortTextRequired).check(z.maxLength(30))),
    required: z.optional(z.boolean()),
  })
  .check((ctx) => {
    // docs/domains/scripts.md: `single` answers with one of `options` and
    // `multi` with several, so a question of either type without them cannot be
    // answered at all. The other four take their answer from the control, and
    // options on them would be stored, shown to nobody, and quietly confusing.
    const { type, options } = ctx.value;
    if (TYPES_WITH_OPTIONS.has(type)) {
      if (!options || options.length === 0) {
        ctx.issues.push({
          code: "custom",
          message: "a single or multi question needs at least one option",
          path: ["options"],
          input: options,
        });
      }
    } else if (options !== undefined) {
      ctx.issues.push({
        code: "custom",
        message: `a ${type} question takes no options`,
        path: ["options"],
        input: options,
      });
    }
  });
export type Question = z.infer<typeof questionSchema>;

export const scriptCreateSchema = z
  .object({
    name: shortTextRequired,
    questions: z.array(questionSchema).check(z.minLength(1), z.maxLength(50)),
  })
  .check((ctx) => {
    // Answers are a record keyed by `key` (`answersSchema`), so two questions
    // sharing one key do not produce two answers — the second silently
    // overwrites the first, and the visit is wrong rather than rejected.
    const seen = new Set<string>();
    ctx.value.questions.forEach((question, index) => {
      if (seen.has(question.key)) {
        ctx.issues.push({
          code: "custom",
          message: `duplicate question key "${question.key}"`,
          path: ["questions", index, "key"],
          input: question.key,
        });
      }
      seen.add(question.key);
    });
  });

export const scriptSchema = z.object({
  id: z.int().check(z.positive()),
  name: shortText,
  version: z.int().check(z.positive()),
  questions: z.array(questionSchema),
  isActive: z.boolean(),
  createdAt: epochMsSchema,
});
export type Script = z.infer<typeof scriptSchema>;

/** Every version, newest first. At most one of them has `isActive`. */
export const scriptsResponseSchema = z.object({
  scripts: z.array(scriptSchema),
});
export type ScriptsResponse = z.infer<typeof scriptsResponseSchema>;

/** Answers are keyed by question `key`; the shape is validated against the script. */
export const answersSchema = z.record(
  z.string().check(z.maxLength(60)),
  z.union([
    z.boolean(),
    z.string().check(z.maxLength(2000)),
    z.number(),
    z.array(z.string().check(z.maxLength(200))).check(z.maxLength(30)),
  ]),
);
export type Answers = z.infer<typeof answersSchema>;

/* ------------------------------------------------------------------ prospects */

export const prospectSchema = z.object({
  id: uuidSchema,
  name: shortTextRequired,
  type: prospectTypeSchema,
  lat: z.nullable(latSchema),
  lng: z.nullable(lngSchema),
  address: z.nullable(shortText),
  phone: z.nullable(shortText),
  website: z.nullable(shortText),
  cuisine: z.nullable(shortText),
  source: sourceSchema,
  status: statusSchema,
  assignedTo: z.nullable(emailSchema),
  lastVisitAt: z.nullable(epochMsSchema),
  nextVisitAt: z.nullable(epochMsSchema),
});
export type Prospect = z.infer<typeof prospectSchema>;

/** One row of a CSV or Overpass import, before the server assigns a dedupe key. */
export const importRowSchema = z.object({
  name: shortTextRequired,
  type: z._default(prospectTypeSchema, "other"),
  lat: z.nullish(latSchema),
  lng: z.nullish(lngSchema),
  address: z.nullish(shortText),
  phone: z.nullish(shortText),
  website: z.nullish(shortText),
  cuisine: z.nullish(shortText),
  sourceRef: z.nullish(shortText),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const prospectBatchSchema = z.object({
  source: z.enum(["csv", "osm"]),
  rows: z.array(importRowSchema).check(z.minLength(1), z.maxLength(IMPORT_ROWS_PER_REQUEST)),
});

/**
 * Admin edit. `status` is accepted here and only here: an admin may reopen or
 * close a prospect by hand (prospecting.md). INVARIANT 3 still holds — a client
 * never sends a status *derived from a visit*.
 */
export const prospectPatchSchema = z
  .partial(
    z.object({
      name: shortTextRequired,
      type: prospectTypeSchema,
      lat: z.nullable(latSchema),
      lng: z.nullable(lngSchema),
      address: z.nullable(shortText),
      phone: z.nullable(shortText),
      website: z.nullable(shortText),
      cuisine: z.nullable(shortText),
      assignedTo: z.nullable(emailSchema),
      status: statusSchema,
      nextVisitAt: z.nullable(epochMsSchema),
    }),
  )
  .check(z.refine((v) => Object.keys(v).length > 0, { error: "no fields to update" }));

export const assignSchema = z.object({
  ids: z.array(uuidSchema).check(z.minLength(1), z.maxLength(500)),
  assignedTo: z.nullable(emailSchema),
});

/** Query string, so every value arrives as text and has to be coerced. */
export const prospectsQuerySchema = z.object({
  status: z.optional(statusSchema),
  assignedTo: z.optional(emailSchema),
  source: z.optional(sourceSchema),
  limit: z._default(
    z.coerce.number().check(z.int(), z.positive(), z.lte(PROSPECTS_PAGE_SIZE)),
    PROSPECTS_PAGE_SIZE,
  ),
  /**
   * Capped like the limit is. SQLite walks the index to reach an offset, so an
   * arbitrarily large one is a scan of the whole table that returns nothing.
   */
  offset: z._default(
    z.coerce.number().check(z.int(), z.nonnegative(), z.lte(PROSPECTS_MAX_OFFSET)),
    0,
  ),
});

export const prospectsResponseSchema = z.object({
  prospects: z.array(prospectSchema),
  /** Rows matching the filters, ignoring limit/offset. The list header shows it. */
  total: z.int().check(z.nonnegative()),
});
export type ProspectsResponse = z.infer<typeof prospectsResponseSchema>;

/**
 * An import never reports "skipped": a row that matches an existing dedupe key
 * is an update, not a duplicate, and that is the whole point of re-importing.
 */
export const importResultSchema = z.object({
  created: z.int().check(z.nonnegative()),
  updated: z.int().check(z.nonnegative()),
});
export type ImportResult = z.infer<typeof importResultSchema>;

export const assignResultSchema = z.object({
  /** Rows whose assignment was written. Unknown ids are silently not counted. */
  assigned: z.int().check(z.nonnegative()),
});
export type AssignResult = z.infer<typeof assignResultSchema>;

/** Route params are strings; an id that is not a UUID must 400, not 404. */
export const prospectIdParamSchema = z.object({ id: uuidSchema });

/** Same shape, different subject — the `:id` of a visit, not of a prospect. */
export const visitIdParamSchema = z.object({ id: uuidSchema });

/* ---------------------------------------------------------------- merging */

/**
 * Two prospects that are probably one place, for the admin to judge.
 * `distanceM` is null when either side has no coordinates.
 */
export const duplicatePairSchema = z.object({
  a: prospectSchema,
  b: prospectSchema,
  distanceM: z.nullable(z.number().check(z.nonnegative())),
  aVisits: z.int().check(z.nonnegative()),
  bVisits: z.int().check(z.nonnegative()),
});
export type DuplicatePair = z.infer<typeof duplicatePairSchema>;

export const duplicatesResponseSchema = z.object({
  pairs: z.array(duplicatePairSchema),
  /** True when the scan hit its cap and more pairs may exist. */
  truncated: z.boolean(),
});
export type DuplicatesResponse = z.infer<typeof duplicatesResponseSchema>;

export const mergeSchema = z
  .object({
    survivorId: uuidSchema,
    mergedId: uuidSchema,
  })
  .check(
    z.refine((v) => v.survivorId !== v.mergedId, {
      error: "a prospect cannot be merged into itself",
      path: ["mergedId"],
    }),
  );

export const mergeResultSchema = z.object({
  survivorId: uuidSchema,
  mergedId: uuidSchema,
  /**
   * Whether the survivor's dedupe key was recomputed. False when the new key
   * is already taken by another live prospect — itself a merge the admin still
   * has to do, so it is reported rather than hidden.
   */
  dedupeKeyUpdated: z.boolean(),
});
export type MergeResult = z.infer<typeof mergeResultSchema>;

/**
 * Everyone a prospect can be assigned to. There is no users table (ADR-0006),
 * so this is the ADMIN_EMAILS and AGENT_EMAILS vars, not a query.
 */
export const agentsResponseSchema = z.object({
  agents: z.array(z.object({ email: emailSchema, role: roleSchema })),
});
export type AgentsResponse = z.infer<typeof agentsResponseSchema>;

/* ----------------------------------------------------------------------- sync */

/** A prospect an agent added on the ground. Always source = field. */
export const fieldProspectSchema = z.object({
  id: uuidSchema,
  name: shortTextRequired,
  type: prospectTypeSchema,
  lat: z.nullish(latSchema),
  lng: z.nullish(lngSchema),
  address: z.nullish(shortText),
  phone: z.nullish(shortText),
  createdAt: epochMsSchema,
});
export type FieldProspect = z.infer<typeof fieldProspectSchema>;

export const visitSchema = z
  .object({
    id: uuidSchema,
    prospectId: uuidSchema,
    /** Phone clock. The server clamps it to received_at on insert (INVARIANT 12). */
    visitedAt: epochMsSchema,
    lat: z.nullish(latSchema),
    lng: z.nullish(lngSchema),
    flyerGiven: z.boolean(),
    outcome: outcomeSchema,
    followUpAt: z.nullish(epochMsSchema),
    notes: z.nullish(longText),
    scriptId: z.nullish(z.int().check(z.positive())),
    answers: z._default(answersSchema, {}),
  })
  .check(
    z.refine((v) => v.outcome !== "follow_up" || typeof v.followUpAt === "number", {
      error: "followUpAt is required when the outcome is follow_up",
      path: ["followUpAt"],
    }),
  );
export type Visit = z.infer<typeof visitSchema>;

export const syncRequestSchema = z.object({
  clientVersion: z.int().check(z.positive()),
  prospects: z._default(
    z.array(fieldProspectSchema).check(z.maxLength(SYNC_PROSPECTS_PER_REQUEST)),
    [],
  ),
  visits: z._default(z.array(visitSchema).check(z.maxLength(SYNC_VISITS_PER_REQUEST)), []),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export const syncResponseSchema = z.object({
  serverTime: epochMsSchema,
  /**
   * INVARIANT 5: the client deletes an outbox row only when its id appears here.
   */
  accepted: z.object({
    prospects: z.array(uuidSchema),
    visits: z.array(uuidSchema),
  }),
  /**
   * Field-prospect dedupe collisions: clientId -> the existing prospect's id.
   * The client rewrites prospectId on anything still in its outbox.
   */
  idMap: z.record(uuidSchema, uuidSchema),
  prospects: z.array(prospectSchema),
  script: z.nullable(scriptSchema),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;

/* ----------------------------------------------------- visit history (agent) */

/**
 * One past visit, as the visit form shows it.
 *
 * Deliberately narrower than the row: `clientVisitedAt`, `receivedAt` and
 * `clientVersion` are clock-skew and upgrade diagnostics, and an agent standing
 * at a door has no use for them. `visitedAt` is the clamped value, which is the
 * one that means "when this happened".
 */
export const visitHistoryEntrySchema = z.object({
  id: uuidSchema,
  prospectId: uuidSchema,
  /** Two agents share a round; whose visit this was is worth showing. */
  agentEmail: emailSchema,
  visitedAt: epochMsSchema,
  flyerGiven: z.boolean(),
  outcome: outcomeSchema,
  followUpAt: z.nullable(epochMsSchema),
  notes: z.nullable(longText),
});
export type VisitHistoryEntry = z.infer<typeof visitHistoryEntrySchema>;

export const visitHistoryResponseSchema = z.object({
  visits: z.array(visitHistoryEntrySchema),
});
export type VisitHistoryResponse = z.infer<typeof visitHistoryResponseSchema>;

/* --------------------------------------------------------------------- admin */

/**
 * One visit as the live feed shows it — ADR-0010.
 *
 * Carries `prospectName`, so this is a join rather than a row echo: a feed that
 * said "a visit arrived" without saying where would be useless. `receivedAt` is
 * here and is what the feed orders by — the server's clock, because a phone's
 * can be wrong (INVARIANT 12) and the feed's promise is "what has reached me".
 *
 * `clientVisitedAt` and `clientVersion` stay out, for the same reason the agent
 * history leaves them out: they are skew and upgrade diagnostics, not content.
 */
export const adminVisitSchema = z.object({
  id: uuidSchema,
  prospectId: uuidSchema,
  prospectName: shortTextRequired,
  agentEmail: emailSchema,
  visitedAt: epochMsSchema,
  receivedAt: epochMsSchema,
  flyerGiven: z.boolean(),
  outcome: outcomeSchema,
  followUpAt: z.nullable(epochMsSchema),
  notes: z.nullable(longText),
});
export type AdminVisit = z.infer<typeof adminVisitSchema>;

export const adminVisitsResponseSchema = z.object({
  visits: z.array(adminVisitSchema).check(z.maxLength(ADMIN_VISITS_PAGE_SIZE)),
  /** The server's clock as it answered, so the client never derives one. */
  serverTime: epochMsSchema,
});
export type AdminVisitsResponse = z.infer<typeof adminVisitsResponseSchema>;

export const visitsSinceQuerySchema = z.object({
  since: z._default(z.coerce.number().check(z.int(), z.nonnegative()), 0),
  limit: z._default(
    z.coerce.number().check(z.int(), z.positive(), z.lte(ADMIN_VISITS_PAGE_SIZE)),
    ADMIN_VISITS_PAGE_SIZE,
  ),
});

/* ----------------------------------------------------------------- dashboard */

/** One of the selector's three values — anything else is a 400, not a guess. */
export const dashboardPeriodSchema = z.literal(DASHBOARD_PERIODS);

/** Query string, so the period arrives as text (docs/api.md › The dashboard). */
export const dashboardQuerySchema = z.object({
  period: z._default(z.pipe(z.coerce.number(), dashboardPeriodSchema), DASHBOARD_DEFAULT_PERIOD),
});

const countSchema = z.int().check(z.nonnegative());

/**
 * `GET /api/admin/dashboard` — every figure is computed by the Worker and
 * defined in docs/api.md › The dashboard. Later stories extend it additively.
 */
export const dashboardResponseSchema = z.object({
  period: dashboardPeriodSchema,
  /** The period's Brussels bounds, `[from, to)`. */
  from: epochMsSchema,
  to: epochMsSchema,
  visits: z.object({
    value: countSchema,
    /** The same count over the `period` days before `from`. */
    previous: countSchema,
    /** `null` when `previous` is 0: there is nothing to compare against. */
    delta: z.nullable(z.number()),
  }),
  /** A snapshot of now, so it carries no delta and ignores the period. */
  openProspects: countSchema,
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

export const overpassImportSchema = z.object({
  polygon: z
    .array(z.tuple([latSchema, lngSchema]))
    .check(z.minLength(POLYGON_MIN_VERTICES), z.maxLength(POLYGON_MAX_VERTICES)),
});

export const placesImportSchema = z.object({
  center: z.tuple([latSchema, lngSchema]),
  /**
   * Metres. Google's own limit is 50 km, but Nearby Search returns at most 20
   * places and has no pagination, so a circle wider than PLACES_RADIUS_MAX_M
   * buys nothing except a bigger area to be silently wrong about (ADR-0020).
   */
  radius: z.number().check(z.gte(PLACES_RADIUS_MIN_M), z.lte(PLACES_RADIUS_MAX_M)),
});

/**
 * One place found on the map, before the admin decides to import it. Both
 * providers return this shape — the results panel renders either without
 * knowing which one it is looking at (ADR-0020).
 *
 * Deliberately **not** an `ImportRow`. OSM is full of amenities with no `name`,
 * and `ingestion.md` wants them shown so the admin can see what the area really
 * holds — but `importRowSchema.name` is non-empty by contract, so a nameless
 * candidate can be displayed and never sent. `named` carries that distinction
 * explicitly rather than making every reader re-derive it from `name === ""`.
 * Google always sends a display name, so its candidates are always `named`;
 * the field stays because one panel renders both.
 *
 * `sourceRef` is required here, unlike on an import row: every OSM element has
 * a `<type>/<id>` and every Google place a `google/<placeId>`, and it is tier 1
 * of the dedupe key — the only tier that survives a rename
 * (docs/domains/prospecting.md).
 */
export const foundPlaceSchema = z.object({
  name: shortText,
  named: z.boolean(),
  type: prospectTypeSchema,
  lat: z.nullable(latSchema),
  lng: z.nullable(lngSchema),
  address: z.nullable(shortText),
  phone: z.nullable(shortText),
  website: z.nullable(shortText),
  cuisine: z.nullable(shortText),
  sourceRef: shortTextRequired,
});
/** A place as the provider describes it, before the Worker compares it with the list. */
export type FoundPlace = z.infer<typeof foundPlaceSchema>;

/**
 * A found place as the preview shows it.
 *
 * `likelyDuplicateOf` is the live prospect this place probably already is —
 * within 50 m and alike by name (`isProbablySamePlace`) — under another source's
 * id, so the dedupe key would not catch it (ADR-0020). Computed on every
 * answer, cached or not, because the list changes and the provider does not.
 * Null for a place that matches nothing, or that matches its own `sourceRef`:
 * that is a re-import, which updates rather than duplicates.
 */
export const areaCandidateSchema = z.extend(foundPlaceSchema, {
  likelyDuplicateOf: z.nullable(z.object({ id: uuidSchema, name: shortText })),
});
export type AreaCandidate = z.infer<typeof areaCandidateSchema>;

/** The answer from either provider — `POST /import/overpass` and `/import/places`. */
export const areaSearchResponseSchema = z.object({
  candidates: z.array(areaCandidateSchema).check(z.maxLength(OVERPASS_CANDIDATES_LIMIT)),
  /**
   * The area held more than the provider returned: past
   * OVERPASS_CANDIDATES_LIMIT for OSM, or past Google's hard cap of
   * PLACES_MAX_RESULTS. Either way the answer is a prefix, and the screen has
   * to say so rather than let a short list look like a thin street.
   */
  truncated: z.boolean(),
  /**
   * Served from `overpass_cache` rather than from the provider. The screen says
   * so: an answer can be up to a week old, and "I searched twice and got the
   * same 47" should be explainable without reading the Worker. For Google it is
   * also the difference between a billable call and a free one.
   */
  cached: z.boolean(),
});
export type AreaSearchResponse = z.infer<typeof areaSearchResponseSchema>;

/* ------------------------------------------------------------------ exports */

/**
 * `GET /api/admin/prospects/export.csv`.
 *
 * The same three filters as the list screen, reusing its enums rather than
 * writing them again — an export that filtered differently from the screen it
 * was launched from would be a quiet lie. No `limit` or `offset`: an export is
 * not paged, it is capped, and the cap is EXPORT_ROWS.
 */
export const prospectsExportQuerySchema = z.object({
  status: z.optional(statusSchema),
  assignedTo: z.optional(emailSchema),
  source: z.optional(sourceSchema),
});

/**
 * `GET /api/admin/visits/export.csv?from=&to=`.
 *
 * Both optional; omitted, the window is the last 30 days ending now. The
 * refinement is what makes a reversed range a 400 rather than an empty file
 * that looks like "no visits happened".
 */
export const visitsExportQuerySchema = z
  .object({
    from: z._default(
      z.coerce.number().check(z.int(), z.nonnegative()),
      () => Date.now() - EXPORT_DEFAULT_WINDOW_MS,
    ),
    to: z._default(z.coerce.number().check(z.int(), z.nonnegative()), () => Date.now()),
  })
  .check(
    z.refine((v) => v.from <= v.to, {
      error: "from must not be after to",
      path: ["from"],
    }),
  );

/* ------------------------------------------- orphaned visits (ADR-0022) */

export const orphanReasonSchema = z.enum(ORPHAN_REASONS);

/**
 * A prospect the admin could attach an orphan to.
 *
 * `distanceM` is null when either side has no coordinates — the screen shows a
 * dash, never a misleading zero, the same rule the duplicates sweep follows.
 */
export const orphanCandidateSchema = z.object({
  id: uuidSchema,
  name: shortTextRequired,
  address: z.nullable(shortText),
  status: statusSchema,
  assignedTo: z.nullable(emailSchema),
  distanceM: z.nullable(z.int()),
});
export type OrphanCandidate = z.infer<typeof orphanCandidateSchema>;

export const orphanedVisitSchema = z.object({
  id: uuidSchema,
  prospectId: uuidSchema,
  agentEmail: emailSchema,
  visitedAt: epochMsSchema,
  receivedAt: epochMsSchema,
  quarantinedAt: epochMsSchema,
  reason: orphanReasonSchema,
  flyerGiven: z.boolean(),
  outcome: outcomeSchema,
  followUpAt: z.nullable(epochMsSchema),
  notes: z.nullable(longText),
  /**
   * The prospect the visit named, when it still resolves. Null for an
   * `unknown_prospect` row, which is the whole reason that row is here.
   */
  prospectName: z.nullable(shortTextRequired),
  /** Ranked nearest-first. Empty when the visit carries no coordinates. */
  candidates: z.array(orphanCandidateSchema).check(z.maxLength(ORPHAN_CANDIDATES)),
});
export type OrphanedVisit = z.infer<typeof orphanedVisitSchema>;

export const orphansResponseSchema = z.object({
  visits: z.array(orphanedVisitSchema).check(z.maxLength(ORPHANS_PAGE_SIZE)),
  /** Rows past the page. A non-zero value means look upstream, not at the page size. */
  remaining: z.int().check(z.nonnegative()),
});
export type OrphansResponse = z.infer<typeof orphansResponseSchema>;

/** For a `not_assigned` row the admin sends the prospect the visit already named. */
export const orphanRepairSchema = z.object({ prospectId: uuidSchema });

export const orphanRepairResultSchema = z.object({
  visitId: uuidSchema,
  prospectId: uuidSchema,
  /** False when the row was already repaired — a replay, not an error (INVARIANT 4). */
  repaired: z.boolean(),
});
export type OrphanRepairResult = z.infer<typeof orphanRepairResultSchema>;

/* ------------------------------------------------------ local dev seeding */

/**
 * `POST /api/dev/seed` — local tooling, and still a request body.
 *
 * It lives here because INVARIANT 6 has no exceptions: a route that casts its
 * body is a route whose shape nobody checks, dev-only or not, and this one
 * writes straight into the prospects table. The field chunk pays nothing worth
 * measuring for it — ADR-0017 puts *every* schema in this file at 3.2 kB raw of
 * that chunk, admin ones included, and nothing on the field side imports this.
 *
 * Deliberately not an `importRowSchema`: the seed picks `assignedTo`, which no
 * real import may do. `script` is a `scriptCreateSchema`, so a seeded
 * questionnaire is exactly what `POST /api/admin/scripts` would have accepted —
 * a seed that could not have been created through the UI is a local database
 * that does not match production, which is what this route exists to avoid.
 */
export const devSeedSchema = z
  .object({
    prospects: z
      .array(
        z.object({
          name: shortTextRequired,
          type: prospectTypeSchema,
          lat: z.nullable(latSchema),
          lng: z.nullable(lngSchema),
          address: z.nullable(shortText),
          assignedTo: z.nullable(emailSchema),
          /** Set as an admin would by hand, once, after the visits are derived. */
          manualStatus: z.optional(statusSchema),
          /** The `name` of another prospect in this body to merge this one into. */
          mergeInto: z.optional(shortTextRequired),
        }),
      )
      .check(z.maxLength(IMPORT_ROWS_PER_REQUEST)),
    script: scriptCreateSchema,
  })
  .check((ctx) => {
    // A merge target is resolved by name within this one body, so a name that
    // is not there — or is the row's own — has nothing to merge into.
    const names = ctx.value.prospects.map((p) => p.name);
    ctx.value.prospects.forEach((prospect, index) => {
      const target = prospect.mergeInto;
      if (target === undefined) return;
      if (target === prospect.name || !names.includes(target)) {
        ctx.issues.push({
          code: "custom",
          message: "mergeInto must name another prospect in this body",
          path: ["prospects", index, "mergeInto"],
          input: target,
        });
      }
    });
  });
export type DevSeed = z.infer<typeof devSeedSchema>;

export const devSeedResultSchema = z.object({
  /** Prospects in the body, inserted or already there. */
  seeded: z.int().check(z.nonnegative()),
  /** Rows this call wrote. All 0 on a repeated seed (INVARIANT 4). */
  inserted: z.object({
    prospects: z.int().check(z.nonnegative()),
    visits: z.int().check(z.nonnegative()),
    orphans: z.int().check(z.nonnegative()),
  }),
});
export type DevSeedResult = z.infer<typeof devSeedResultSchema>;

/* -------------------------------------------------------------------- errors */

export const errorSchema = z.object({
  error: z.string(),
  message: z.optional(z.string()),
  issues: z.optional(z.unknown()),
});
export type ApiError = z.infer<typeof errorSchema>;

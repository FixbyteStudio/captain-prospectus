/**
 * The wire contract. INVARIANT 6: every request body is validated with a schema
 * from this file. No inline ad-hoc validation in routes.
 *
 * JSON is camelCase, SQL is snake_case (Drizzle maps them). Timestamps are
 * epoch-millisecond integers.
 */
import { z } from "zod";
import {
  ADMIN_VISITS_PAGE_SIZE,
  IMPORT_ROWS_PER_REQUEST,
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
export const epochMsSchema = z.int().nonnegative();
export const latSchema = z.number().min(-90).max(90);
export const lngSchema = z.number().min(-180).max(180);
export const emailSchema = z.email().toLowerCase().max(320);

/** Free text from the field or an import. Capped so a payload cannot balloon. */
const shortText = z.string().trim().max(200);
const longText = z.string().trim().max(2000);

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

export const questionSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "key must be snake_case and start with a letter")
    .max(60),
  label: shortText.min(1),
  type: z.enum(QUESTION_TYPES),
  options: z.array(shortText.min(1)).max(30).optional(),
  required: z.boolean().optional(),
});
export type Question = z.infer<typeof questionSchema>;

export const scriptCreateSchema = z.object({
  name: shortText.min(1),
  questions: z.array(questionSchema).min(1).max(50),
});

export const scriptSchema = z.object({
  id: z.int().positive(),
  name: shortText,
  version: z.int().positive(),
  questions: z.array(questionSchema),
  isActive: z.boolean(),
  createdAt: epochMsSchema,
});
export type Script = z.infer<typeof scriptSchema>;

/** Answers are keyed by question `key`; the shape is validated against the script. */
export const answersSchema = z.record(
  z.string().max(60),
  z.union([z.boolean(), z.string().max(2000), z.number(), z.array(z.string().max(200)).max(30)]),
);
export type Answers = z.infer<typeof answersSchema>;

/* ------------------------------------------------------------------ prospects */

export const prospectSchema = z.object({
  id: uuidSchema,
  name: shortText.min(1),
  type: prospectTypeSchema,
  lat: latSchema.nullable(),
  lng: lngSchema.nullable(),
  address: shortText.nullable(),
  phone: shortText.nullable(),
  website: shortText.nullable(),
  cuisine: shortText.nullable(),
  source: sourceSchema,
  status: statusSchema,
  assignedTo: emailSchema.nullable(),
  lastVisitAt: epochMsSchema.nullable(),
  nextVisitAt: epochMsSchema.nullable(),
});
export type Prospect = z.infer<typeof prospectSchema>;

/** One row of a CSV or Overpass import, before the server assigns a dedupe key. */
export const importRowSchema = z.object({
  name: shortText.min(1),
  type: prospectTypeSchema.default("other"),
  lat: latSchema.nullish(),
  lng: lngSchema.nullish(),
  address: shortText.nullish(),
  phone: shortText.nullish(),
  website: shortText.nullish(),
  cuisine: shortText.nullish(),
  sourceRef: shortText.nullish(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const prospectBatchSchema = z.object({
  source: z.enum(["csv", "osm"]),
  rows: z.array(importRowSchema).min(1).max(IMPORT_ROWS_PER_REQUEST),
});

/**
 * Admin edit. `status` is accepted here and only here: an admin may reopen or
 * close a prospect by hand (prospecting.md). INVARIANT 3 still holds — a client
 * never sends a status *derived from a visit*.
 */
export const prospectPatchSchema = z
  .object({
    name: shortText.min(1),
    type: prospectTypeSchema,
    lat: latSchema.nullable(),
    lng: lngSchema.nullable(),
    address: shortText.nullable(),
    phone: shortText.nullable(),
    website: shortText.nullable(),
    cuisine: shortText.nullable(),
    assignedTo: emailSchema.nullable(),
    status: statusSchema,
    nextVisitAt: epochMsSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });

export const assignSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(500),
  assignedTo: emailSchema.nullable(),
});

export const prospectsQuerySchema = z.object({
  status: statusSchema.optional(),
  assignedTo: emailSchema.optional(),
  source: sourceSchema.optional(),
});

/* ----------------------------------------------------------------------- sync */

/** A prospect an agent added on the ground. Always source = field. */
export const fieldProspectSchema = z.object({
  id: uuidSchema,
  name: shortText.min(1),
  type: prospectTypeSchema,
  lat: latSchema.nullish(),
  lng: lngSchema.nullish(),
  address: shortText.nullish(),
  phone: shortText.nullish(),
  createdAt: epochMsSchema,
});
export type FieldProspect = z.infer<typeof fieldProspectSchema>;

export const visitSchema = z
  .object({
    id: uuidSchema,
    prospectId: uuidSchema,
    /** Phone clock. The server clamps it to received_at on insert (INVARIANT 12). */
    visitedAt: epochMsSchema,
    lat: latSchema.nullish(),
    lng: lngSchema.nullish(),
    flyerGiven: z.boolean(),
    outcome: outcomeSchema,
    followUpAt: epochMsSchema.nullish(),
    notes: longText.nullish(),
    scriptId: z.int().positive().nullish(),
    answers: answersSchema.default({}),
  })
  .refine((v) => v.outcome !== "follow_up" || typeof v.followUpAt === "number", {
    message: "followUpAt is required when the outcome is follow_up",
    path: ["followUpAt"],
  });
export type Visit = z.infer<typeof visitSchema>;

export const syncRequestSchema = z.object({
  clientVersion: z.int().positive(),
  prospects: z.array(fieldProspectSchema).max(SYNC_PROSPECTS_PER_REQUEST).default([]),
  visits: z.array(visitSchema).max(SYNC_VISITS_PER_REQUEST).default([]),
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
  script: scriptSchema.nullable(),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;

/* --------------------------------------------------------------------- admin */

export const visitsSinceQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(ADMIN_VISITS_PAGE_SIZE)
    .default(ADMIN_VISITS_PAGE_SIZE),
});

export const overpassImportSchema = z.object({
  polygon: z
    .array(z.tuple([latSchema, lngSchema]))
    .min(POLYGON_MIN_VERTICES)
    .max(POLYGON_MAX_VERTICES),
});

/* -------------------------------------------------------------------- errors */

export const errorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  issues: z.unknown().optional(),
});
export type ApiError = z.infer<typeof errorSchema>;

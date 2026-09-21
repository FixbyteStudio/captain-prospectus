/**
 * Shared constants and domain enums.
 *
 * Pure module: no DOM, no Worker APIs (CLAUDE.md). Both sides import from here;
 * the values below are the ones the domain docs describe, and the docs win.
 */

/** docs/glossary.md — a prospect's lifecycle. */
export const STATUSES = ["new", "assigned", "follow_up", "converted", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

/** docs/glossary.md — the result of one visit. */
export const OUTCOMES = [
  "no_contact",
  "interested",
  "not_interested",
  "follow_up",
  "converted",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const PROSPECT_TYPES = [
  "restaurant",
  "fast_food",
  "cafe",
  "bar",
  "food_truck",
  "other",
] as const;
export type ProspectType = (typeof PROSPECT_TYPES)[number];

export const SOURCES = ["csv", "osm", "field"] as const;
export type Source = (typeof SOURCES)[number];

export const ROLES = ["admin", "agent"] as const;
export type Role = (typeof ROLES)[number];

export const QUESTION_TYPES = ["yes_no", "single", "multi", "text", "number", "rating"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/**
 * docs/domains/prospecting.md — the status a visit outcome produces.
 *
 * INVARIANT 3: the server computes this. Clients never send a derived status.
 */
export const OUTCOME_TO_STATUS: Readonly<Record<Outcome, Status>> = {
  no_contact: "follow_up",
  interested: "follow_up",
  not_interested: "rejected",
  follow_up: "follow_up",
  converted: "converted",
};

/** Statuses that put a prospect on an agent's today list. */
export const OPEN_STATUSES: readonly Status[] = ["new", "assigned", "follow_up"];

export function isOpen(status: Status): boolean {
  return OPEN_STATUSES.includes(status);
}

/**
 * Sync contract version (ADR-0007).
 *
 * Bump CLIENT_VERSION on any breaking change to the /api/agent/sync payload.
 * Raise MIN_CLIENT_VERSION only once every phone reports the new version:
 *   select agent_email, max(client_version) from visits group by agent_email;
 * Below MIN_CLIENT_VERSION the server answers 426 and the client updates
 * WITHOUT clearing its outbox. See the sync-contract-change skill.
 */
export const CLIENT_VERSION = 1;
export const MIN_CLIENT_VERSION = 1;

/**
 * Payload caps.
 *
 * IMPORT_ROWS_PER_REQUEST is set by the Workers Free 10 ms CPU budget, not by
 * payload size: validating and normalising a row costs CPU, waiting on D1 does
 * not. See docs/free-tier-budget.md.
 */
export const IMPORT_ROWS_PER_REQUEST = 250;
export const SYNC_VISITS_PER_REQUEST = 200;
export const SYNC_PROSPECTS_PER_REQUEST = 100;
export const ADMIN_VISITS_PAGE_SIZE = 500;

/**
 * One page of the admin prospect list. Also the cap: D1's free tier counts
 * *scanned* rows, so an unbounded select over a few thousand prospects is a
 * real cost every time the admin changes a filter.
 */
export const PROSPECTS_PAGE_SIZE = 200;

/**
 * How deep the list can be paged. SQLite walks the index to reach an offset, so
 * an unbounded one is a full scan that returns nothing. 100 pages is far past
 * the few thousand prospects this project plans for (vision.md).
 */
export const PROSPECTS_MAX_OFFSET = PROSPECTS_PAGE_SIZE * 100;

/** D1 allows at most 100 bound parameters per statement. See chunk(). */
export const D1_MAX_BOUND_PARAMS = 100;

/** Overpass polygon bounds (docs/domains/ingestion.md). */
export const POLYGON_MIN_VERTICES = 3;
export const POLYGON_MAX_VERTICES = 200;

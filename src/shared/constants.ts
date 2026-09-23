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

/**
 * Where a prospect came from. `osm` and `google` are both the map import, and
 * they stay distinct: they have different licences, different freshness and
 * different `source_ref` formats, and the admin filters on the difference
 * (ADR-0020).
 */
export const SOURCES = ["csv", "osm", "google", "field"] as const;
export type Source = (typeof SOURCES)[number];

export const ROLES = ["admin", "agent"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Why a visit is in `visits_orphaned` rather than `visits` (ADR-0022).
 *
 * The admin screen affords different actions per reason: an `unknown_prospect`
 * row has no target and needs one chosen, a `not_assigned` row already names
 * the prospect and only needs approving.
 */
export const ORPHAN_REASONS = ["unknown_prospect", "not_assigned"] as const;
export type OrphanReason = (typeof ORPHAN_REASONS)[number];

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
 * Largest request body the Worker will read, in bytes.
 *
 * Measured, not guessed. The biggest request a real client can build is a full
 * sync: 100 field prospects with every field at its cap, plus 200 visits each
 * carrying a 2000-character note and an answer to every question of a
 * 50-question script — **1060 KiB**. Nothing else is close: 250 import rows are
 * 325 KiB, the largest script 310 KiB, 500 assign ids 19 KiB, a 200-vertex
 * polygon 5 KiB. A sync carrying notes but no answers is 514 KiB, and a real
 * day's sync is well under 100 KiB.
 *
 * So the floor is 1060 KiB and this is roughly twice it. What the cap is for is
 * the other end: `answersSchema` does not bound how many answers a visit
 * carries, so a payload of 200 visits each holding 50 answers of 2000
 * characters is 19.7 MiB and still schema-valid. That is what gets refused
 * before JSON.parse ever sees it (docs/security.md, "Malformed or oversized
 * payloads").
 *
 * This caps *reading*, and is not a second array cap — the per-request caps
 * above are what protect the 10 ms CPU budget (INVARIANT 13).
 *
 * The headroom is deliberate, because the two failure directions are not
 * symmetric. Too high costs one integer comparison. Too low answers 413 to a
 * payload the outbox rebuilds identically for ever — sync.ts keeps every row on
 * any non-auth error, so a cap under what a phone can build is a loop with no
 * exit, which is INVARIANT 5's failure mode. Raise SYNC_VISITS_PER_REQUEST,
 * IMPORT_ROWS_PER_REQUEST or longText and the budget tests in constants.test.ts
 * will tell you to raise this too.
 */
export const MAX_REQUEST_BYTES = 2_097_152;

/**
 * Script versions returned by `GET /api/admin/scripts`. Editing a script writes
 * a new row rather than updating one (docs/domains/scripts.md), so this table
 * only ever grows — slowly, by hand, but it grows.
 */
export const SCRIPTS_PAGE_SIZE = 100;

/** Past visits shown on the visit form. Enough context, one D1 page. */
export const VISIT_HISTORY_LIMIT = 20;

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

/**
 * The orphan repair queue, and how many prospects it offers per row.
 *
 * A healthy database has an empty queue, so the page size is a safety rail
 * rather than a working limit — if it is ever hit, something is wrong upstream
 * and the number is not what needs raising. The candidate count is small on
 * purpose: the admin is picking the right door from a ranked shortlist, and a
 * long list is a worse decision, not a better-informed one.
 */
export const ORPHANS_PAGE_SIZE = 200;
export const ORPHAN_CANDIDATES = 5;

/** Candidate duplicate pairs returned in one sweep. */
export const DUPLICATES_PAGE_SIZE = 100;

/**
 * Prospects the duplicate sweep will compare in one request.
 *
 * Comparing pairs is CPU, and Workers Free allows 10 ms of it; waiting on D1 is
 * what is free. Bucketing by location keeps the comparisons near-linear, but the
 * scan itself still has to be bounded.
 */
export const DUPLICATES_SCAN_LIMIT = 5_000;

/** D1 allows at most 100 bound parameters per statement. See chunk(). */
export const D1_MAX_BOUND_PARAMS = 100;

/** Overpass polygon bounds (docs/domains/ingestion.md). */
export const POLYGON_MIN_VERTICES = 3;
export const POLYGON_MAX_VERTICES = 200;

/**
 * How long an Overpass answer stays good (ADR-0008).
 *
 * Overpass is a shared public service run on donated hardware, and OSM does not
 * change much in a week. The cache is what makes a redraw-and-search-again loop
 * polite rather than abusive.
 */
export const OVERPASS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Candidates returned from one map import.
 *
 * Like DUPLICATES_SCAN_LIMIT, this is a CPU cap, not a payload one. Workers Free
 * allows 10 ms per request; waiting on Overpass is free, but `JSON.parse` of its
 * answer and mapping every element's tags are not. A polygon big enough to
 * return more than this is a polygon the admin should split anyway, so the
 * response says `truncated` rather than silently costing more.
 */
export const OVERPASS_CANDIDATES_LIMIT = 1_000;

/* ------------------------------------------------ Google Places (ADR-0020) */

/**
 * Nearby Search has no polygon search, so the Google provider draws a circle.
 *
 * The 50 km Google allows is pointless behind a 20-result cap: a circle that
 * large returns the 20 places nearest its centre and nothing else. 2 km is
 * already more than one canvassing round.
 */
export const PLACES_RADIUS_MIN_M = 50;
export const PLACES_RADIUS_MAX_M = 2_000;

/**
 * Google's own ceiling, not a choice of ours: `maxResultCount` caps at 20 and
 * Nearby Search has no page tokens. A circle holding more than this returns its
 * 20 nearest and sets `truncated`, and the screen tells the admin to shrink it.
 */
export const PLACES_MAX_RESULTS = 20;

/**
 * How long a Google answer stays good (ADR-0020).
 *
 * The same seven days as OVERPASS_CACHE_TTL_MS, for a different reason, which
 * is why it is a separate constant: the Overpass cache is etiquette towards a
 * donated public service, this one is how we avoid paying twice for the same
 * circle. Google's terms also cap caching of Places content at 30 days, so this
 * number may shrink but must never grow past that.
 */
export const PLACES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

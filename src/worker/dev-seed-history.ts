/**
 * The visit history `POST /api/dev/seed` gives each seeded prospect (GH #108).
 *
 * Pure: every row is a function of the prospect's dedupe key, its fixed story
 * and `now`. Ids are hashed from stable labels rather than drawn at random, so a
 * second seed — any day later — computes the same ids and inserts nothing
 * (INVARIANT 4). Only the dashboard's windows slide over the rows as days pass.
 */
import { CLIENT_VERSION, type Outcome } from "../shared/constants";
import { brusselsPeriod } from "../shared/period";
import type { NewVisitRow } from "./db/schema";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** How far back the seeded walk may start. */
export const SEED_HISTORY_DAYS = 180;

/**
 * cyrb128: a fast, well-mixed 128-bit string hash. Not cryptographic, which a
 * seed id does not need; what it needs is the same answer on every run.
 */
function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** mulberry32: a seeded PRNG in [0, 1). `Math.random()` would break idempotency. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A stable UUID for a label: its 128-bit hash, stamped as version 8 (RFC 9562,
 * "custom") with the RFC variant, so `uuidSchema` accepts it like a phone's v4.
 */
export function seedId(label: string): string {
  const hex = cyrb128(label)
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/**
 * The Brussels midnight that starts the day `k` days before today (negative k
 * is ahead). Anchored at noon, so stepping whole 24 h days across a clock
 * change never slides over a midnight (src/shared/period.ts owns the boundary).
 */
export function seedDayStart(now: number, k: number): number {
  const todayStart = brusselsPeriod(now, 1).from;
  return brusselsPeriod(todayStart + 12 * HOUR - k * DAY, 1).from;
}

type Step = {
  /** Days before today. */
  k: number;
  outcome: Outcome;
  /** Days before today of the follow-up, when the outcome asks for one. */
  followUpK?: number;
};

/**
 * Stories for each agent's first prospects, so every dashboard figure has data
 * whatever the walk draws. The converted ones are spread so that each period
 * (7, 30, 90 days) and the one before it hold a conversion.
 */
export const FIXED_STORIES: readonly (readonly Step[])[] = [
  [
    { k: 20, outcome: "no_contact", followUpK: 12 },
    { k: 12, outcome: "interested", followUpK: 2 },
    { k: 2, outcome: "converted" },
  ],
  [{ k: 9, outcome: "converted" }],
  [{ k: 40, outcome: "converted" }],
  [{ k: 120, outcome: "converted" }],
  // Due today: a Relance due.
  [{ k: 3, outcome: "follow_up", followUpK: 0 }],
  // Due in 5 days: a Relance due within 7 days.
  [{ k: 1, outcome: "interested", followUpK: -5 }],
  [{ k: 4, outcome: "not_interested" }],
  // No visit, so it stays assigned.
  [],
];

/**
 * The walk's outcome weights, in percent of visits. `converted` and
 * `not_interested` end it. Tuned with the gap and the drop-out below so ~300
 * places average 10–15 visits a day over 180 days with ~5 % converted, the
 * mockup's figures; dev-seed-history.test.ts pins the average.
 */
const WALK_WEIGHTS: readonly (readonly [Outcome, number])[] = [
  ["no_contact", 36],
  ["interested", 26],
  ["follow_up", 31],
  ["not_interested", 2],
  ["converted", 5],
];
const WALK_TOTAL = WALK_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
const NO_HISTORY_SHARE = 0.15;
const DROP_OUT_SHARE = 0.01;
const FLYER_SHARE = 0.4;
const MIN_GAP_DAYS = 2;
const MAX_GAP_DAYS = 4;
/** Visits happen in the working day; follow-ups are booked for the morning. */
const FIRST_VISIT_HOUR = 8;
const VISIT_HOURS = 11;
const FOLLOW_UP_HOUR = 10;

function pickOutcome(rand: () => number): Outcome {
  let roll = rand() * WALK_TOTAL;
  for (const [outcome, weight] of WALK_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return outcome;
  }
  return "no_contact";
}

function takesFollowUp(outcome: Outcome): boolean {
  return outcome === "no_contact" || outcome === "interested" || outcome === "follow_up";
}

export type SeedSubject = {
  id: string;
  dedupeKey: string;
  /** Visits go to the assignee only, as sync would accept them. None when null. */
  assignedTo: string | null;
  lat: number | null;
  lng: number | null;
  /** An index into FIXED_STORIES, or null for the seeded walk. */
  story: number | null;
};

/**
 * One prospect's history over the last SEED_HISTORY_DAYS Brussels days.
 *
 * The draws happen in the same order whatever `now` is, so the n-th visit is
 * the same visit on every run; `now` only clamps a visit of today that has not
 * happened yet (INVARIANT 12).
 */
export function seedHistory(prospect: SeedSubject, now: number): NewVisitRow[] {
  const agent = prospect.assignedTo;
  if (agent === null) return [];

  const rand = mulberry32(cyrb128(prospect.dedupeKey)[0]);
  const rows: NewVisitRow[] = [];

  const visit = (k: number, outcome: Outcome, followUpK: number | null) => {
    const planned = seedDayStart(now, k) + FIRST_VISIT_HOUR * HOUR + rand() * VISIT_HOURS * HOUR;
    const visitedAt = Math.min(Math.floor(planned), now);
    const receivedAt = Math.min(visitedAt + Math.floor(rand() * 30 * 60_000), now);
    const flyerGiven = rand() < FLYER_SHARE;
    rows.push({
      id: seedId(`${prospect.dedupeKey}:${rows.length}`),
      prospectId: prospect.id,
      agentEmail: agent,
      visitedAt,
      clientVisitedAt: visitedAt,
      receivedAt,
      lat: prospect.lat,
      lng: prospect.lng,
      flyerGiven,
      outcome,
      followUpAt: followUpK === null ? null : seedDayStart(now, followUpK) + FOLLOW_UP_HOUR * HOUR,
      notes: null,
      // No panel reads answers, and a script id would tie the row to one database.
      scriptId: null,
      answers: {},
      clientVersion: CLIENT_VERSION,
    });
  };

  if (prospect.story !== null) {
    for (const step of FIXED_STORIES[prospect.story] ?? []) {
      visit(step.k, step.outcome, step.followUpK ?? null);
    }
    return rows;
  }

  if (rand() < NO_HISTORY_SHARE) return rows;

  let k = Math.floor(rand() * SEED_HISTORY_DAYS);
  while (k >= 0) {
    const outcome = pickOutcome(rand);
    if (!takesFollowUp(outcome)) {
      visit(k, outcome, null);
      break;
    }
    const gap = MIN_GAP_DAYS + Math.floor(rand() * (MAX_GAP_DAYS - MIN_GAP_DAYS + 1));
    visit(k, outcome, k - gap);
    // Dropping out leaves the follow-up standing: an overdue Relance.
    if (rand() < DROP_OUT_SHARE) break;
    k -= gap;
  }
  return rows;
}

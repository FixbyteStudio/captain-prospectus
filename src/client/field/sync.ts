/**
 * The sync engine — ADR-0007, docs/domains/field-operations.md.
 *
 * One round trip pushes the outbox and pulls the today list. The rules that
 * matter are all about not losing a visit:
 *
 *   INVARIANT 5  an outbox row is deleted only when the server lists its id in
 *                `accepted`. An auth failure or a 426 never clears anything.
 *   INVARIANT 4  ids are client UUIDs and every insert is idempotent, so
 *                resending a payload is harmless.
 *
 * Everything is injected (db, fetch, clock) so the failure paths can be tested
 * without a network or a browser.
 */
import {
  CLIENT_VERSION,
  MAX_REQUEST_BYTES,
  SYNC_PROSPECTS_PER_REQUEST,
  SYNC_VISITS_PER_REQUEST,
} from "../../shared/constants";
import { syncResponseSchema } from "../../shared/schemas";
import type { SyncRequest } from "../../shared/schemas";
import { type FieldDb, setMeta } from "./db";

export type SyncStatus =
  | "ok"
  /** No network. Keep everything, try again later. */
  | "offline"
  /** Access session expired. Keep everything; the user must sign in again. */
  | "auth"
  /** Build too old (426). Keep everything; update the service worker. */
  | "upgrade"
  /** Server or quota error. Keep everything; back off. */
  | "error";

export type SyncResult = {
  status: SyncStatus;
  acceptedProspects: number;
  acceptedVisits: number;
  /** Still pending after this attempt. */
  remaining: number;
};

export type SyncDeps = {
  db: FieldDb;
  fetchFn?: typeof fetch;
  endpoint?: string;
};

const EMPTY = { acceptedProspects: 0, acceptedVisits: 0 };

/**
 * Serialize the payload, dropping visits off the end until it fits
 * MAX_REQUEST_BYTES.
 *
 * The count caps above bound how many rows go out; they cannot bound how many
 * bytes, because `answersSchema` does not limit how many answers a visit
 * carries. A full batch of ordinary visits is about 1 MB and fits; a batch of
 * 200 visits each holding 50 answers of 2000 characters is 19.7 MB and does
 * not, and it is schema-valid all the same.
 *
 * The server refuses what it cannot read (INVARIANT 13), and a payload the
 * server always refuses is a payload the outbox rebuilds identically for ever,
 * because every non-auth failure keeps every row (INVARIANT 5). So the client
 * makes sure it never builds one.
 *
 * Field prospects are never dropped: 100 of them at every field's cap is 74 kB,
 * so they alone cannot exceed the cap, and a visit may reference one created in
 * the same payload — they have to travel together or earlier. At least one visit
 * always survives, so the outbox drains one round trip at a time through the
 * existing `remaining` path rather than stalling.
 *
 * Costs one `JSON.stringify` in the common case, and returns that same string.
 */
function serializeWithinCap(payload: SyncRequest): string {
  let visits = payload.visits;
  let serialized = JSON.stringify({ ...payload, visits });

  // Bytes, not characters: MAX_REQUEST_BYTES is what the Worker counts, and a
  // note written outdoors is full of accented characters worth two of them.
  const bytes = (value: string) => new TextEncoder().encode(value).length;

  // Halve rather than drop one at a time: the loop ends in at most log2(200)
  // passes instead of 200 stringifies of a near-megabyte payload.
  while (visits.length > 1 && bytes(serialized) > MAX_REQUEST_BYTES) {
    visits = visits.slice(0, Math.max(1, Math.floor(visits.length / 2)));
    serialized = JSON.stringify({ ...payload, visits });
  }
  return serialized;
}

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const { db } = deps;
  const doFetch = deps.fetchFn ?? fetch;
  const endpoint = deps.endpoint ?? "/api/agent/sync";

  // Bounded slices: a phone offline for a week must not build a payload that
  // blows the request size or the Worker's 10 ms CPU budget (INVARIANT 13).
  const outboxProspects = await db.outboxProspects.limit(SYNC_PROSPECTS_PER_REQUEST).toArray();
  const outboxVisits = await db.outboxVisits.limit(SYNC_VISITS_PER_REQUEST).toArray();

  const requestBody = serializeWithinCap({
    clientVersion: CLIENT_VERSION,
    prospects: outboxProspects,
    visits: outboxVisits,
  });

  let response: Response;
  try {
    response = await doFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
      // An expired Access session answers with a redirect to the login page.
      // "manual" turns that into an opaque response instead of following it and
      // parsing an HTML page as JSON.
      redirect: "manual",
    });
  } catch {
    return { status: "offline", ...EMPTY, remaining: await countPending(db) };
  }

  if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403) {
    return { status: "auth", ...EMPTY, remaining: await countPending(db) };
  }
  if (response.status === 426) {
    return { status: "upgrade", ...EMPTY, remaining: await countPending(db) };
  }
  if (!response.ok) {
    return { status: "error", ...EMPTY, remaining: await countPending(db) };
  }

  const parsed = syncResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    // A response we cannot trust is treated as a failure: never delete an
    // outbox row on the strength of a payload we could not verify.
    return { status: "error", ...EMPTY, remaining: await countPending(db) };
  }
  const body = parsed.data;

  await db.transaction(
    "rw",
    [db.prospects, db.outboxProspects, db.outboxVisits, db.meta],
    async () => {
      // A field prospect that turned out to already exist: rewrite every
      // reference still sitting in the outbox before anything is deleted.
      for (const [clientId, serverId] of Object.entries(body.idMap)) {
        const affected = await db.outboxVisits.where("prospectId").equals(clientId).toArray();
        for (const visit of affected) {
          await db.outboxVisits.put({ ...visit, prospectId: serverId });
        }
      }

      // INVARIANT 5: delete only what the server actually listed.
      if (body.accepted.prospects.length > 0) {
        await db.outboxProspects.bulkDelete(body.accepted.prospects);
      }
      if (body.accepted.visits.length > 0) {
        await db.outboxVisits.bulkDelete(body.accepted.visits);
      }

      // The today list is a cache: replace it wholesale.
      await db.prospects.clear();
      await db.prospects.bulkPut(body.prospects);

      await setMeta(db, "script", body.script);
      await setMeta(db, "lastSyncAt", body.serverTime);
    },
  );

  return {
    status: "ok",
    acceptedProspects: body.accepted.prospects.length,
    acceptedVisits: body.accepted.visits.length,
    remaining: await countPending(db),
  };
}

async function countPending(db: FieldDb): Promise<number> {
  const [p, v] = await Promise.all([db.outboxProspects.count(), db.outboxVisits.count()]);
  return p + v;
}

/* ------------------------------------------------------------------ backoff */

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 5 * 60_000;

/**
 * Exponential backoff after a failed sync.
 *
 * docs/free-tier-budget.md watch-out: a sync stuck in a retry loop is the one
 * realistic way this app burns its request quota.
 */
export function backoffDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  const exponential = BASE_DELAY_MS * 2 ** (consecutiveFailures - 1);
  return Math.min(exponential, MAX_DELAY_MS);
}

/** Sync triggers: app start, `online`, after each visit, every 60 s while open. */
export const SYNC_INTERVAL_MS = 60_000;

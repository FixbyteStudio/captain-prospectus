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
 * A row stamped by another identity is never sent: the server would file it
 * under whoever is signed in now (docs/backlog/005). It waits in the outbox.
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
import type { FieldProspect, SyncRequest, Visit } from "../../shared/schemas";
import { type FieldDb, type OutboxStamp, outboxCounts, sendableBy, setMeta } from "./db";

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
  /** Still pending after this attempt: rows this identity will send. */
  remaining: number;
  /** Rows another identity wrote, left in the outbox and not sent. */
  heldBack: number;
};

export type SyncDeps = {
  db: FieldDb;
  /** The email signed in now. Only rows it wrote, or unstamped ones, are sent. */
  identity: string;
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

/** The wire shape of an outbox row: the stamp stays on the device. */
function unstamped<T extends OutboxStamp>(row: T): Omit<T, "writtenBy"> {
  const wire: T = { ...row };
  delete wire.writtenBy;
  return wire;
}

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const { db, identity } = deps;
  const doFetch = deps.fetchFn ?? fetch;
  const endpoint = deps.endpoint ?? "/api/agent/sync";
  const countPending = () => countOutbox(db, identity);

  // Bounded slices: a phone offline for a week must not build a payload that
  // blows the request size or the Worker's 10 ms CPU budget (INVARIANT 13).
  // Filtered before the limit, so another identity's rows cannot fill the
  // slice and starve this one's.
  const mine = sendableBy(identity);
  const outboxProspects = await db.outboxProspects
    .filter(mine)
    .limit(SYNC_PROSPECTS_PER_REQUEST)
    .toArray();
  const outboxVisits = await db.outboxVisits.filter(mine).limit(SYNC_VISITS_PER_REQUEST).toArray();

  const requestBody = serializeWithinCap({
    clientVersion: CLIENT_VERSION,
    prospects: outboxProspects.map((row): FieldProspect => unstamped(row)),
    visits: outboxVisits.map((row): Visit => unstamped(row)),
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
    return { status: "offline", ...EMPTY, ...(await countPending()) };
  }

  if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403) {
    return { status: "auth", ...EMPTY, ...(await countPending()) };
  }
  if (response.status === 426) {
    return { status: "upgrade", ...EMPTY, ...(await countPending()) };
  }
  if (!response.ok) {
    return { status: "error", ...EMPTY, ...(await countPending()) };
  }

  const parsed = syncResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    // A response we cannot trust is treated as a failure: never delete an
    // outbox row on the strength of a payload we could not verify.
    return { status: "error", ...EMPTY, ...(await countPending()) };
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

      // An unstamped row in this slice went out as this identity's (or waits
      // one pass behind the byte cap to do so). Stamping what the server did
      // not accept keeps it theirs, so the next identity holds it back rather
      // than sending it again under another name.
      for (const row of outboxProspects) {
        if (row.writtenBy === undefined) {
          await db.outboxProspects.update(row.id, { writtenBy: identity });
        }
      }
      for (const row of outboxVisits) {
        if (row.writtenBy === undefined) {
          await db.outboxVisits.update(row.id, { writtenBy: identity });
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
    ...(await countPending()),
  };
}

async function countOutbox(
  db: FieldDb,
  identity: string,
): Promise<Pick<SyncResult, "remaining" | "heldBack">> {
  const { pending, heldBack } = await outboxCounts(db, identity);
  return { remaining: pending, heldBack };
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

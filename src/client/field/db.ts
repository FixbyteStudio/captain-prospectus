/**
 * The phone's local store — docs/domains/field-operations.md.
 *
 * INVARIANT: this is a cache plus an outbox, never the source of truth. The
 * outbox is the only copy of a visit until the server accepts it, so a schema
 * upgrade must MIGRATE outbox rows and never clear them.
 */
import Dexie, { type Table } from "dexie";
import type {
  FieldProspect,
  MeResponse,
  Prospect,
  Script,
  Visit,
  VisitHistoryEntry,
} from "../../shared/schemas";

export type MetaValues = {
  script: Script | null;
  lastSyncAt: number;
  /**
   * The last identity `/api/me` returned.
   *
   * Cached because the shell cannot reach the network on a pavement with no
   * signal, and an agent opening the app there must still get their round.
   * It is a convenience for rendering, never proof of anything: the Worker
   * re-derives identity from the verified Access JWT on every request
   * (INVARIANT 10), so a tampered copy of this unlocks nothing.
   */
  identity: MeResponse;
};
export type MetaKey = keyof MetaValues;

/**
 * The email of the identity that wrote an outbox row — docs/backlog/005.
 *
 * Dexie-only bookkeeping, never on the wire: the Worker takes `agentEmail`
 * from the verified JWT (INVARIANT 10), so the stamp only decides whether this
 * device may send the row *under the identity now signed in*. Optional because
 * a row queued before v3 with no identity cached has none; `runSync` treats
 * that row as the current identity's.
 */
export type OutboxStamp = { writtenBy?: string };
export type StoredVisit = Visit & OutboxStamp;
export type StoredFieldProspect = FieldProspect & OutboxStamp;
export type MetaRow = { key: MetaKey; value: MetaValues[MetaKey] };

export class FieldDb extends Dexie {
  prospects!: Table<Prospect, string>;
  outboxProspects!: Table<StoredFieldProspect, string>;
  outboxVisits!: Table<StoredVisit, string>;
  meta!: Table<MetaRow, string>;
  /**
   * Past visits pulled from the server, so the visit form can still show
   * « Visites précédentes » with no signal (field-operations.md: "offline it
   * shows what is cached"). A cache, never a source of truth — unlike the
   * outbox, losing this loses nothing.
   */
  visitHistory!: Table<VisitHistoryEntry, string>;

  constructor(name = "captain-prospectus") {
    super(name);
    this.version(1).stores({
      prospects: "id, status, assignedTo",
      outboxProspects: "id",
      outboxVisits: "id, prospectId",
      meta: "key",
    });
    /**
     * v2 ADDS a table and changes no existing one, so Dexie carries every row
     * across untouched and no upgrade function is needed. That is the only
     * shape of migration allowed to run near the outbox: the sync-contract-change
     * skill's step 3 says a version bump must migrate outbox rows, never clear
     * them, and the safest way to honour that is not to touch them.
     */
    this.version(2).stores({
      visitHistory: "id, prospectId",
    });
    /**
     * v3 stamps every queued row with `writtenBy`. It modifies rows in place
     * and deletes none (sync-contract-change step 3): a row queued before the
     * upgrade takes the cached identity, the best guess at who wrote it, and
     * stays unstamped when none is cached rather than being dropped.
     */
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        const row = (await tx.table("meta").get("identity" satisfies MetaKey)) as
          { value?: { email?: unknown } } | undefined;
        const email = row?.value?.email;
        if (typeof email !== "string") return;
        const stamp = (item: OutboxStamp) => {
          item.writtenBy ??= email;
        };
        await tx.table("outboxVisits").toCollection().modify(stamp);
        await tx.table("outboxProspects").toCollection().modify(stamp);
      });
  }
}

export const fieldDb = new FieldDb();

export async function getMeta<K extends MetaKey>(
  db: FieldDb,
  key: K,
): Promise<MetaValues[K] | undefined> {
  const row = await db.meta.get(key);
  return row?.value as MetaValues[K] | undefined;
}

export async function setMeta<K extends MetaKey>(
  db: FieldDb,
  key: K,
  value: MetaValues[K],
): Promise<void> {
  await db.meta.put({ key, value });
}

/**
 * Whether `identity` may send this outbox row. An unstamped row predates v3
 * with no identity cached, and belongs to whoever syncs it first
 * (docs/backlog/005) — holding it back would strand it for good.
 */
export function sendableBy(identity: string): (row: OutboxStamp) => boolean {
  return (row) => row.writtenBy === undefined || row.writtenBy === identity;
}

export type OutboxCounts = {
  /** Rows `identity` will send: waiting on the network, nothing else. */
  pending: number;
  /** Rows another identity wrote, which this one never sends. */
  heldBack: number;
};

/** Split the outbox between what `identity` can send and what it holds back. */
export async function outboxCounts(db: FieldDb, identity: string): Promise<OutboxCounts> {
  const mine = sendableBy(identity);
  const [prospects, visits] = await Promise.all([
    db.outboxProspects.toArray(),
    db.outboxVisits.toArray(),
  ]);
  const rows: OutboxStamp[] = [...prospects, ...visits];
  const pending = rows.filter(mine).length;
  return { pending, heldBack: rows.length - pending };
}

/**
 * Replace a prospect's cached history with what the server just returned.
 *
 * Scoped to one prospect: another prospect's cache is still valid, and an
 * agent offline for the rest of the round should keep it.
 */
export async function cacheVisitHistory(
  db: FieldDb,
  prospectId: string,
  entries: readonly VisitHistoryEntry[],
): Promise<void> {
  await db.transaction("rw", db.visitHistory, async () => {
    await db.visitHistory.where("prospectId").equals(prospectId).delete();
    if (entries.length > 0) await db.visitHistory.bulkPut([...entries]);
  });
}

/**
 * Drop everything this device caches *about an agent*, keeping the outbox.
 *
 * Used when the identity that owns the cache stops being valid: another agent
 * signed in, or the Worker answered `/api/me` with a 401 because the email was
 * removed from the Access policy (docs/security.md, "stolen phone"). Without
 * this, the round and the visit history survive the revocation and the next
 * launch with no network shows them again — offline there is no 401 to refuse.
 *
 * The outbox is deliberately not touched: INVARIANT 5 lets only the server's
 * `accepted` list delete a queued visit, and a revoked session is not that.
 * The next identity does not send those rows either: each is stamped with its
 * writer and `runSync` holds back any stamped by someone else.
 */
export async function clearAgentCache(db: FieldDb): Promise<void> {
  await Promise.all([
    db.prospects.clear(),
    db.visitHistory.clear(),
    db.meta.delete("identity" satisfies MetaKey),
  ]);
}

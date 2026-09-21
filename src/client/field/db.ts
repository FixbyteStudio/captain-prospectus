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
  Prospect,
  Script,
  Visit,
  VisitHistoryEntry,
} from "../../shared/schemas";

export type MetaValues = {
  script: Script | null;
  lastSyncAt: number;
  agentEmail: string;
};
export type MetaKey = keyof MetaValues;
export type MetaRow = { key: MetaKey; value: MetaValues[MetaKey] };

export class FieldDb extends Dexie {
  prospects!: Table<Prospect, string>;
  outboxProspects!: Table<FieldProspect, string>;
  outboxVisits!: Table<Visit, string>;
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

/** How many local writes are still waiting for the server to accept them. */
export async function pendingCount(db: FieldDb): Promise<number> {
  const [prospects, visits] = await Promise.all([
    db.outboxProspects.count(),
    db.outboxVisits.count(),
  ]);
  return prospects + visits;
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

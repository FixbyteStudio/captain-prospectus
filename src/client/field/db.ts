/**
 * The phone's local store — docs/domains/field-operations.md.
 *
 * INVARIANT: this is a cache plus an outbox, never the source of truth. The
 * outbox is the only copy of a visit until the server accepts it, so a schema
 * upgrade must MIGRATE outbox rows and never clear them.
 */
import Dexie, { type Table } from "dexie";
import type { FieldProspect, Prospect, Script, Visit } from "../../shared/schemas";

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

  constructor(name = "captain-prospectus") {
    super(name);
    this.version(1).stores({
      prospects: "id, status, assignedTo",
      outboxProspects: "id",
      outboxVisits: "id, prospectId",
      meta: "key",
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

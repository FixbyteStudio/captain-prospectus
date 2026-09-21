import { useLiveQuery } from "dexie-react-hooks";
import { copy } from "../copy";
import { fieldDb, pendingCount } from "./db";
import { TYPE_LABELS } from "../copy";

/** Placeholder for M2: the real ordering, visit form and map links land there.
 *  The field screens get their own design pass — one thumb, outdoors, in a hurry. */
export function TodayScreen() {
  const prospects = useLiveQuery(() => fieldDb.prospects.toArray(), [], []);
  const pending = useLiveQuery(() => pendingCount(fieldDb), [], 0);

  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.005em]">{copy.today.title}</h2>
      {pending > 0 && <p className="text-muted-foreground mt-1">{copy.sync.pending(pending)}</p>}
      {prospects.length === 0 ? (
        <p className="text-muted-foreground mt-1">{copy.today.empty}</p>
      ) : (
        <ul className="border-border divide-border mt-4 divide-y border-y">
          {prospects.map((p) => (
            <li key={p.id} className="flex min-h-touch items-center justify-between gap-4">
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground">{TYPE_LABELS[p.type]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

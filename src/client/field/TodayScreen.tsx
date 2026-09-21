import { useLiveQuery } from "dexie-react-hooks";
import { copy } from "../copy";
import { fieldDb, pendingCount } from "./db";
import { TYPE_LABELS } from "../copy";

/** Placeholder for M2: the real ordering, visit form and map links land there. */
export function TodayScreen() {
  const prospects = useLiveQuery(() => fieldDb.prospects.toArray(), [], []);
  const pending = useLiveQuery(() => pendingCount(fieldDb), [], 0);

  return (
    <section>
      <h2>{copy.today.title}</h2>
      {pending > 0 && <p className="muted">{copy.sync.pending(pending)}</p>}
      {prospects.length === 0 ? (
        <p className="muted">{copy.today.empty}</p>
      ) : (
        <ul>
          {prospects.map((p) => (
            <li key={p.id}>
              {p.name} — {TYPE_LABELS[p.type]}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { copy } from "../copy";

/** Placeholder for M4: the live feed polls /api/admin/visits every 15 s. */
export function VisitsScreen() {
  return (
    <section>
      <h2>{copy.nav.visits}</h2>
      <p className="muted">Arrive en M4.</p>
    </section>
  );
}

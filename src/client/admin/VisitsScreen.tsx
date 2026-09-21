import { copy } from "../copy";

/** Placeholder for M4: the live feed polls /api/admin/visits every 15 s. */
export function VisitsScreen() {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.005em]">{copy.nav.visits}</h2>
      <p className="text-muted-foreground mt-1">Arrive en M4.</p>
    </section>
  );
}

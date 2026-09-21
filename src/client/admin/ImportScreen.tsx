import { copy } from "../copy";

/** Placeholder for the CSV import: file, column mapping, preview. Lands in PR 4. */
export function ImportScreen() {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.005em]">{copy.prospects.importCta}</h2>
      <p className="text-muted-foreground mt-1">Arrive en M1.</p>
    </section>
  );
}

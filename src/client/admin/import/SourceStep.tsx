import { copy } from "../../copy";

/**
 * Step one: which source — docs/domains/ingestion.md, "two sources, one
 * pipeline".
 *
 * A fork, not a setting. The map is not a seventh nav link (the band already
 * carries six), and not a toggle on the file step either: the two paths ask
 * completely different second questions.
 *
 * A bordered, divided list rather than two tiles — design.md forbids cards on
 * the admin side, and the script editor already establishes the dense ledger
 * row as what this app uses instead.
 *
 * This is also the accessible fork. Drawing a polygon is a pointer gesture;
 * this screen, and everything down the CSV path, is reachable from a keyboard
 * (design.md, "The map import").
 */
export function SourceStep({ onChoose }: { onChoose: (source: "csv" | "osm") => void }) {
  return (
    <div>
      <p className="text-muted-foreground mb-4">{copy.import.source.lede}</p>
      <ul className="border-border bg-card divide-border max-w-2xl divide-y rounded-md border">
        <Choice
          label={copy.import.source.csv}
          hint={copy.import.source.csvHint}
          onClick={() => onChoose("csv")}
        />
        <Choice
          label={copy.import.source.map}
          hint={copy.import.source.mapHint}
          onClick={() => onChoose("osm")}
        />
      </ul>
    </div>
  );
}

function Choice({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="hover:bg-accent focus-visible:bg-accent flex w-full flex-col gap-0.5 px-3.5 py-3 text-left transition-colors"
      >
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </button>
    </li>
  );
}

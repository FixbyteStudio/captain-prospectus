import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { ImportRow } from "../../../shared/schemas";
import { copy } from "../../copy";
import { cn } from "../../lib/utils";
import { useImportBatches } from "../queries";
import { ColumnsStep } from "./ColumnsStep";
import { FileStep } from "./FileStep";
import { MapStep, type MapProvider } from "./MapStep";
import { PreviewStep } from "./PreviewStep";
import { ResultDialog } from "./ResultDialog";
import { SourceStep } from "./SourceStep";
import { guessColumns, mapRows } from "./csv";
import type { Source } from "../../../shared/constants";
import type { ColumnMap, ParsedCsv } from "./csv";

type Step = "source" | "file" | "columns" | "map" | "preview";

/**
 * The stepper shows the path the admin is on, not every path there is. The map
 * source has one step after the fork — the polygon and its results are the same
 * screen (design.md, "The map import") — so a three-step rail above it would be
 * describing a flow that does not exist.
 */
const CSV_STEPS: readonly { id: Step; label: string }[] = [
  { id: "source", label: copy.import.steps.source },
  { id: "file", label: copy.import.steps.file },
  { id: "columns", label: copy.import.steps.columns },
  { id: "preview", label: copy.import.steps.preview },
];

const MAP_STEPS: readonly { id: Step; label: string }[] = [
  { id: "source", label: copy.import.steps.source },
  { id: "map", label: copy.import.steps.map },
];

/**
 * CSV import — docs/domains/ingestion.md.
 *
 * Three steps on one page rather than a dialog: the mapping needs room for a
 * sample value under every field, and the preview is the moment the admin
 * decides, so it should not be a scrolling box. The admin always sees a preview
 * before anything is written.
 */
export function ImportScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("source");
  const [fork, setFork] = useState<"csv" | "map">("csv");
  /**
   * Which map provider the map step is on, held here rather than inside it.
   *
   * It is what the import is stamped with, and `useImportBatches` needs that
   * before a row is sent. Keeping it at this level also means the CSV path's
   * sender is untouched by ADR-0020 — its source is still just "csv".
   */
  const [provider, setProvider] = useState<MapProvider>("osm");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [columns, setColumns] = useState<ColumnMap>({});

  // The sender is shared; only the `source` it stamps on each batch differs.
  const source: Source = fork === "csv" ? "csv" : provider;
  const importer = useImportBatches(source);

  const mapped = useMemo(
    () => (parsed ? mapRows(parsed, columns, copy.import.reasons) : []),
    [parsed, columns],
  );
  const ready = useMemo(() => mapped.flatMap((row) => (row.ok ? [row.row] : [])), [mapped]);
  const rejected = useMemo(() => mapped.filter((row) => !row.ok), [mapped]);

  function onParsed(name: string, csv: ParsedCsv) {
    setFileName(name);
    setParsed(csv);
    setColumns(guessColumns(csv.headers));
    setStep("columns");
  }

  function startOver() {
    setStep("source");
    setFork("csv");
    setProvider("osm");
    setFileName(null);
    setParsed(null);
    setColumns({});
    // MapStep holds the polygon, so remounting it at the fork is what clears
    // it — there is no third copy of that state to forget to reset.
    importer.reset();
  }

  function chooseSource(chosen: "csv" | "map") {
    setFork(chosen);
    setStep(chosen === "csv" ? "file" : "map");
  }

  function run(rows: ImportRow[]) {
    importer.start(rows);
  }

  const steps = step === "source" || fork === "csv" ? CSV_STEPS : MAP_STEPS;
  const reachedStep = steps.findIndex((s) => s.id === step);

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold tracking-[-0.005em]">{copy.import.title}</h2>

      <nav className="text-muted-foreground mb-5 flex items-center gap-2.5" aria-label="Étapes">
        {steps.map((s, index) => (
          <span key={s.id} className="flex items-center gap-2.5">
            {index > 0 && <span className="bg-border h-px w-6" aria-hidden="true" />}
            <span
              aria-current={s.id === step ? "step" : undefined}
              className={cn(
                s.id === step && "text-foreground font-semibold",
                // A finished step is success-green, not the brand gold: gold text
                // is 2.2:1 on this page (docs/design.md).
                index < reachedStep && "text-success",
              )}
            >
              {s.label}
            </span>
          </span>
        ))}
      </nav>

      {step === "source" && <SourceStep onChoose={chooseSource} />}

      {step === "map" && (
        <MapStep
          provider={provider}
          onProviderChange={setProvider}
          progress={importer.progress}
          isRunning={importer.isRunning}
          error={importer.error}
          onBack={startOver}
          onStart={run}
        />
      )}

      {step === "file" && <FileStep onParsed={onParsed} />}

      {step === "columns" && parsed && (
        <ColumnsStep
          parsed={parsed}
          fileName={fileName}
          columns={columns}
          onChange={setColumns}
          onBack={() => setStep("file")}
          onNext={() => setStep("preview")}
        />
      )}

      {step === "preview" && parsed && (
        <PreviewStep
          ready={ready}
          rejected={rejected}
          progress={importer.progress}
          isRunning={importer.isRunning}
          error={importer.error}
          onBack={() => setStep("columns")}
          onStart={() => run(ready)}
        />
      )}

      <ResultDialog
        result={importer.result}
        rejectedCount={rejected.length}
        onClose={startOver}
        onSeeProspects={() => navigate("/admin/prospects")}
      />
    </section>
  );
}

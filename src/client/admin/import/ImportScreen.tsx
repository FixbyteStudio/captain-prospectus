import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { ImportRow } from "../../../shared/schemas";
import { copy } from "../../copy";
import { cn } from "../../lib/utils";
import { useImportBatches } from "../queries";
import { ColumnsStep } from "./ColumnsStep";
import { FileStep } from "./FileStep";
import { PreviewStep } from "./PreviewStep";
import { ResultDialog } from "./ResultDialog";
import { guessColumns, mapRows } from "./csv";
import type { ColumnMap, ParsedCsv } from "./csv";

type Step = "file" | "columns" | "preview";

const STEPS: readonly { id: Step; label: string }[] = [
  { id: "file", label: copy.import.steps.file },
  { id: "columns", label: copy.import.steps.columns },
  { id: "preview", label: copy.import.steps.preview },
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
  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [columns, setColumns] = useState<ColumnMap>({});

  const importer = useImportBatches();

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
    setStep("file");
    setFileName(null);
    setParsed(null);
    setColumns({});
    importer.reset();
  }

  function run(rows: ImportRow[]) {
    importer.start(rows);
  }

  const reachedStep = STEPS.findIndex((s) => s.id === step);

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold tracking-[-0.005em]">{copy.import.title}</h2>

      <nav className="text-muted-foreground mb-5 flex items-center gap-2.5" aria-label="Étapes">
        {STEPS.map((s, index) => (
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

      {step === "file" && <FileStep onParsed={onParsed} />}

      {step === "columns" && parsed && (
        <ColumnsStep
          parsed={parsed}
          fileName={fileName}
          columns={columns}
          onChange={setColumns}
          onBack={startOver}
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

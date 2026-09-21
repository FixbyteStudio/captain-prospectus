import type { ImportRow } from "../../../shared/schemas";
import { TYPE_LABELS, copy } from "../../copy";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Progress } from "../../ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import type { MappedRow } from "./csv";

/** Enough to judge the file by; the full list is the import itself. */
const SHOWN = 50;

/**
 * Step three: see what will happen, then decide.
 *
 * Rejected lines come first with their reason, so the problems are the first
 * thing read rather than something to scroll for. A line without coordinates is
 * kept and flagged, not rejected — it belongs on the round, just without
 * distance ordering (ingestion.md).
 */
export function PreviewStep({
  ready,
  rejected,
  progress,
  isRunning,
  error,
  onBack,
  onStart,
}: {
  ready: ImportRow[];
  rejected: MappedRow[];
  progress: { done: number; total: number };
  isRunning: boolean;
  error: string | null;
  onBack: () => void;
  onStart: () => void;
}) {
  const shown = ready.slice(0, SHOWN);
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  return (
    <div>
      <div className="mb-5 flex gap-8">
        <span>
          <strong className="text-display tnum block font-semibold">{ready.length}</strong>
          <span className="text-muted-foreground">{copy.import.preview.ready(ready.length)}</span>
        </span>
        {rejected.length > 0 && (
          <span>
            <strong className="text-display tnum text-destructive block font-semibold">
              {rejected.length}
            </strong>
            <span className="text-muted-foreground">
              {copy.import.preview.rejected(rejected.length)}
            </span>
          </span>
        )}
      </div>

      <div className="border-border bg-card overflow-hidden rounded-md border">
        <Table className="[&_td]:h-row [&_td]:py-0">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-full min-w-48 pl-3.5">
                {copy.import.columns.fields.name}
              </TableHead>
              <TableHead>{copy.import.columns.fields.type}</TableHead>
              <TableHead>{copy.import.columns.fields.address}</TableHead>
              <TableHead className="text-right">{copy.import.preview.coordinates}</TableHead>
              <TableHead>{copy.import.preview.note}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rejected.map((row) =>
              row.ok ? null : (
                <TableRow key={`rejected-${row.line}`}>
                  <TableCell className="text-muted-foreground pl-3.5 shadow-[inset_4px_0_0_0_var(--color-status-rejected)]">
                    <span className="line-through decoration-border">
                      {row.name ?? copy.import.preview.line(row.line)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell className="text-muted-foreground">{row.address ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-right">—</TableCell>
                  <TableCell className="text-destructive whitespace-nowrap">{row.reason}</TableCell>
                </TableRow>
              ),
            )}

            {shown.map((row, index) => (
              <TableRow key={`ready-${index}`}>
                <TableCell className="pl-3.5 font-medium shadow-[inset_4px_0_0_0_var(--color-status-new)]">
                  {row.name}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {TYPE_LABELS[row.type]}
                </TableCell>
                <TableCell className="text-muted-foreground">{row.address ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground tnum text-right whitespace-nowrap">
                  {typeof row.lat === "number" && typeof row.lng === "number"
                    ? `${row.lat.toFixed(4)} ${row.lng.toFixed(4)}`
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {typeof row.lat === "number" && typeof row.lng === "number"
                    ? ""
                    : copy.import.preview.noCoordinates}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {ready.length > SHOWN && (
        <p className="text-muted-foreground mt-2 text-xs">
          {copy.import.preview.showingFirst(SHOWN)}
        </p>
      )}

      {isRunning && (
        <div className="mt-5 max-w-md">
          <Progress value={percent} />
          <p className="text-muted-foreground tnum mt-2">
            {copy.import.running(progress.done, progress.total)}
          </p>
        </div>
      )}

      {error && !isRunning && (
        <Alert variant="destructive" className="mt-5 max-w-2xl">
          <AlertDescription>{copy.import.failed}</AlertDescription>
        </Alert>
      )}

      <div className="mt-5 flex gap-2">
        <Button variant="outline" onClick={onBack} disabled={isRunning}>
          {copy.import.actions.back}
        </Button>
        <Button onClick={onStart} disabled={isRunning || ready.length === 0}>
          {error ? copy.import.actions.retry : copy.import.actions.start(ready.length)}
        </Button>
        {ready.length === 0 && (
          <span className="text-muted-foreground self-center">
            {copy.import.preview.nothingToImport}
          </span>
        )}
      </div>
    </div>
  );
}

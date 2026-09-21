import { copy } from "../../copy";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { MAPPABLE_FIELDS, sampleFor } from "./csv";
import type { ColumnMap, MappableField, ParsedCsv } from "./csv";

/** Radix cannot hold an empty string as a value. */
const SKIP = "__skip__";

/**
 * Step two: say which column is which.
 *
 * The value from the file's first row sits under every select. That one detail
 * is what makes a mapping trustworthy in a single pass — without it the admin
 * is matching two lists of words and hoping.
 */
export function ColumnsStep({
  parsed,
  fileName,
  columns,
  onChange,
  onBack,
  onNext,
}: {
  parsed: ParsedCsv;
  fileName: string | null;
  columns: ColumnMap;
  onChange: (columns: ColumnMap) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function set(field: MappableField, header: string) {
    const next = { ...columns };
    if (header === SKIP) delete next[field];
    else next[field] = header;
    onChange(next);
  }

  return (
    <div className="border-border bg-card max-w-2xl rounded-md border p-5">
      {fileName && (
        <p className="tnum text-muted-foreground mb-1">
          {copy.import.file.chosen(fileName, parsed.rows.length)}
        </p>
      )}
      <p className="text-muted-foreground mb-5 max-w-prose">{copy.import.columns.lede}</p>

      <div className="grid max-w-xl grid-cols-1 items-start gap-x-5 gap-y-3.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
        {MAPPABLE_FIELDS.map((field) => {
          const header = columns[field];
          const sample = sampleFor(parsed, header);
          return (
            <Row
              key={field}
              field={field}
              header={header}
              sample={sample}
              headers={parsed.headers}
              onChange={(value) => set(field, value)}
            />
          );
        })}
      </div>

      {!columns.name && (
        <Alert variant="destructive" className="mt-5 max-w-xl">
          <AlertDescription>{copy.import.columns.required}</AlertDescription>
        </Alert>
      )}

      <p className="text-muted-foreground mt-5 max-w-prose text-xs">
        {copy.import.columns.unmappedNote}
      </p>

      <div className="border-border mt-5 flex gap-2 border-t pt-5">
        <Button variant="outline" onClick={onBack}>
          {copy.import.actions.back}
        </Button>
        <Button disabled={!columns.name} onClick={onNext}>
          {copy.import.actions.toPreview}
        </Button>
      </div>
    </div>
  );
}

function Row({
  field,
  header,
  sample,
  headers,
  onChange,
}: {
  field: MappableField;
  header: string | undefined;
  sample: string | null;
  headers: string[];
  onChange: (value: string) => void;
}) {
  const id = `map-${field}`;
  return (
    <>
      <label className="pt-1.5 font-medium sm:pt-2" htmlFor={id}>
        {copy.import.columns.fields[field]}
        {field === "name" && <span className="text-destructive"> *</span>}
      </label>
      <div>
        <Select value={header ?? SKIP} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SKIP}>{copy.import.columns.skip}</SelectItem>
            {headers.map((h) => (
              <SelectItem key={h} value={h}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 truncate text-xs">
          {header ? (sample ?? copy.import.columns.noSample) : ""}
        </p>
        {field === "sourceRef" && (
          <p className="text-muted-foreground max-w-prose text-xs">
            {copy.import.columns.sourceRefHint}
          </p>
        )}
      </div>
    </>
  );
}

/**
 * CSV serialisation — RFC 4180, with the two concessions a spreadsheet needs.
 *
 * Pure module: no DOM, no Worker APIs (CLAUDE.md). The exports go out of an
 * admin route, but the rules are worth unit-testing away from a database.
 *
 * Timestamps are ISO-8601 here rather than the epoch milliseconds the rest of
 * the app uses, because a spreadsheet cannot read epoch ms — it shows a
 * 13-digit number and the admin has to write a formula. This is the one place
 * the timestamp convention is deliberately broken, and only on the way out.
 */

/** A cell before it is written. `null` means empty, never the text "null". */
export type Cell = string | number | boolean | null | undefined;

/**
 * Quote a field if it could otherwise break the row, and double any quote
 * inside it.
 *
 * A comma, a quote and a newline are the three characters that can do that.
 * Notes are free text typed outdoors, so all three turn up in practice: a note
 * containing a newline must still parse as one row.
 */
export function csvField(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

/** One row, already escaped. */
export function csvRow(cells: readonly Cell[]): string {
  return cells.map(csvField).join(",");
}

/**
 * A whole file: header, rows, then a trailing comment line.
 *
 * CRLF line endings, per RFC 4180 — Excel on Windows is the reader that cares,
 * and every other tool accepts them.
 *
 * `trailer` carries the OSM attribution that architecture.md invariant 9
 * requires on every export. It is a `#` comment rather than a data row so a
 * parser does not read it as a prospect; most spreadsheet software shows it as
 * a last line of text, which is exactly the point — the attribution has to be
 * visible in the file, not just in our code.
 */
export function csvFile(
  header: readonly string[],
  rows: readonly (readonly Cell[])[],
  trailer?: string,
): string {
  const lines = [csvRow(header), ...rows.map(csvRow)];
  if (trailer) lines.push(trailer);
  return lines.join("\r\n") + "\r\n";
}

/**
 * Epoch milliseconds as an ISO-8601 string, or empty.
 *
 * UTC, not a local zone: the Worker has no notion of the admin's timezone, and
 * a column that silently shifts by an hour twice a year is worse than one that
 * is explicitly UTC.
 */
export function csvTimestamp(ms: number | null | undefined): string {
  if (typeof ms !== "number") return "";
  return new Date(ms).toISOString();
}

/** `prospects-2026-09-23.csv` — the request's own date, in UTC. */
export function csvFilename(prefix: string, at: number): string {
  const day = new Date(at).toISOString().slice(0, 10);
  return `${prefix}-${day}.csv`;
}

/** `content-disposition` for a download, with the filename quoted. */
export function csvDisposition(filename: string): string {
  return `attachment; filename="${filename}"`;
}

/** OSM attribution, required on every export (architecture.md invariant 9). */
export const CSV_ATTRIBUTION = "# © OpenStreetMap contributors";

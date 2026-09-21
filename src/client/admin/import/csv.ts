/**
 * CSV to import rows — docs/domains/ingestion.md.
 *
 * Parsing happens in the browser: the file never leaves the laptop and is never
 * stored. The Worker only ever sees validated rows.
 */
import Papa from "papaparse";
import { importRowSchema } from "../../../shared/schemas";
import type { ImportRow } from "../../../shared/schemas";
import { PROSPECT_TYPES } from "../../../shared/constants";
import type { ProspectType } from "../../../shared/constants";
import { normalize } from "../../../shared/dedupe";

/** Every prospect field a column can be mapped to. `name` is the only required one. */
export const MAPPABLE_FIELDS = [
  "name",
  "type",
  "lat",
  "lng",
  "address",
  "phone",
  "website",
  "cuisine",
  "sourceRef",
] as const;
export type MappableField = (typeof MAPPABLE_FIELDS)[number];

/** Field -> CSV header. A field absent from the map is simply not imported. */
export type ColumnMap = Partial<Record<MappableField, string>>;

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Header spellings we recognise, so a typical French or English export maps
 * itself and the admin only corrects what we got wrong. Compared normalised, so
 * "Nom de l'établissement" and "nom_etablissement" are the same thing.
 */
const ALIASES: Readonly<Record<MappableField, string[]>> = {
  name: ["name", "nom", "nom-etablissement", "etablissement", "raison-sociale", "enseigne"],
  type: ["type", "categorie", "category", "amenity"],
  lat: ["lat", "latitude", "y"],
  lng: ["lng", "lon", "long", "longitude", "x"],
  address: ["address", "adresse", "rue", "street", "addr"],
  phone: ["phone", "telephone", "tel", "tel-fixe", "numero"],
  website: ["website", "site", "site-web", "url", "web"],
  cuisine: ["cuisine", "specialite", "speciality"],
  sourceRef: ["sourceref", "source-ref", "id", "identifiant", "ref", "reference", "osm-id"],
};

export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields?.filter((h) => h.length > 0) ?? [];
  return { headers, rows: result.data };
}

/**
 * First guess at the mapping. The admin sees it and corrects it before anything
 * is written, so a wrong guess costs a click and a missed one costs nothing.
 *
 * Exact matches are claimed first, across every field, before any fuzzy one —
 * otherwise a header like "Nom du contact" could take `name` while the real
 * "Nom" column is still sitting there unclaimed.
 */
export function guessColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const taken = new Set<string>();
  const tokens = new Map(headers.map((h) => [h, normalize(h).split("-").filter(Boolean)]));

  const claim = (field: MappableField, header: string | undefined) => {
    if (!header || map[field] || taken.has(header)) return;
    map[field] = header;
    taken.add(header);
  };

  for (const field of MAPPABLE_FIELDS) {
    claim(
      field,
      headers.find((h) => !taken.has(h) && ALIASES[field].includes(normalize(h))),
    );
  }

  // "Nom de l'établissement" carries every token of the alias "nom-etablissement".
  for (const field of MAPPABLE_FIELDS) {
    claim(
      field,
      headers.find((h) => {
        if (taken.has(h)) return false;
        const words = tokens.get(h) ?? [];
        return ALIASES[field].some((alias) =>
          alias.split("-").every((word) => words.includes(word)),
        );
      }),
    );
  }

  return map;
}

/** The first row's value for a mapped column — shown under each select. */
export function sampleFor(parsed: ParsedCsv, header: string | undefined): string | null {
  if (!header) return null;
  const value = parsed.rows[0]?.[header]?.trim();
  return value ? value : null;
}

function readNumber(value: string | undefined): number | null {
  if (!value) return null;
  // French exports write decimals with a comma.
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function readType(value: string | undefined): ProspectType | undefined {
  if (!value) return undefined;
  const candidate = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (PROSPECT_TYPES as readonly string[]).includes(candidate)
    ? (candidate as ProspectType)
    : undefined;
}

function readText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export type MappedRow =
  | { ok: true; line: number; row: ImportRow }
  | { ok: false; line: number; name: string | null; address: string | null; reason: string };

/**
 * Map and validate every row against the real wire schema, so the preview
 * rejects exactly what the Worker would reject — no second opinion, no surprise
 * 400 after the admin has approved the import.
 *
 * `line` counts the file's data rows from 1, which is what the admin sees in
 * their spreadsheet once the header is discounted.
 */
export function mapRows(
  parsed: ParsedCsv,
  columns: ColumnMap,
  reasons: { missingName: string; invalid: string },
): MappedRow[] {
  return parsed.rows.map((raw, index) => {
    const line = index + 1;
    const pick = (field: MappableField) => {
      const header = columns[field];
      return header ? raw[header] : undefined;
    };

    const name = readText(pick("name"));
    const address = readText(pick("address")) ?? null;

    if (!name) {
      return { ok: false, line, name: null, address, reason: reasons.missingName };
    }

    const candidate = {
      name,
      type: readType(pick("type")),
      lat: readNumber(pick("lat")),
      lng: readNumber(pick("lng")),
      address,
      phone: readText(pick("phone")) ?? null,
      website: readText(pick("website")) ?? null,
      cuisine: readText(pick("cuisine")) ?? null,
      sourceRef: readText(pick("sourceRef")) ?? null,
    };

    const result = importRowSchema.safeParse(candidate);
    if (!result.success) {
      return { ok: false, line, name, address, reason: reasons.invalid };
    }
    return { ok: true, line, row: result.data };
  });
}

/** Split into request-sized batches. The cap is the Worker's, not ours. */
export function batched<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

import { describe, expect, it } from "vitest";
import { batched, guessColumns, mapRows, parseCsv, sampleFor } from "./csv";

const REASONS = { missingName: "Nom manquant", invalid: "Ligne invalide" };

describe("parseCsv", () => {
  it("reads headers and rows, ignoring blank lines", () => {
    const parsed = parseCsv("nom,adresse\nChez Léa,4 place Bellecour\n\nLe Zinc,9 rue Mercière\n");
    expect(parsed.headers).toEqual(["nom", "adresse"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[1]?.nom).toBe("Le Zinc");
  });

  it("trims padded headers, which a spreadsheet export often has", () => {
    expect(parseCsv(" nom , adresse \nChez Léa,x").headers).toEqual(["nom", "adresse"]);
  });
});

describe("guessColumns", () => {
  it("recognises French headers", () => {
    const map = guessColumns(["Nom de l'établissement", "Adresse", "Téléphone", "Catégorie"]);
    expect(map.name).toBe("Nom de l'établissement");
    expect(map.address).toBe("Adresse");
    expect(map.phone).toBe("Téléphone");
    expect(map.type).toBe("Catégorie");
  });

  it("recognises English headers and coordinates", () => {
    const map = guessColumns(["name", "latitude", "longitude", "website"]);
    expect(map).toMatchObject({
      name: "name",
      lat: "latitude",
      lng: "longitude",
      website: "website",
    });
  });

  it("leaves a field unmapped rather than guessing wildly", () => {
    const map = guessColumns(["colonne A", "colonne B"]);
    expect(map.name).toBeUndefined();
  });

  it("never maps one column to two fields", () => {
    // "id" matches sourceRef; nothing else should also claim it.
    const map = guessColumns(["nom", "id"]);
    const used = Object.values(map);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe("sampleFor", () => {
  it("returns the first row's value, or null when there is nothing to show", () => {
    const parsed = parseCsv("nom,tel\nChez Léa,\n");
    expect(sampleFor(parsed, "nom")).toBe("Chez Léa");
    expect(sampleFor(parsed, "tel")).toBeNull();
    expect(sampleFor(parsed, undefined)).toBeNull();
  });
});

describe("mapRows", () => {
  it("maps a mapped row into an import row", () => {
    const parsed = parseCsv("nom,lat,lng,cat\nChez Léa,45.7578,4.8320,restaurant\n");
    const [row] = mapRows(parsed, { name: "nom", lat: "lat", lng: "lng", type: "cat" }, REASONS);

    expect(row?.ok).toBe(true);
    if (!row?.ok) return;
    expect(row.row).toMatchObject({
      name: "Chez Léa",
      lat: 45.7578,
      lng: 4.832,
      type: "restaurant",
    });
  });

  it("reads decimals written with a comma", () => {
    // A French spreadsheet export writes 45,7578 — parsing that as NaN would
    // silently drop the coordinates and break distance ordering on the round.
    const parsed = parseCsv('nom;lat;lng\nChez Léa;"45,7578";"4,8320"\n');
    const [row] = mapRows(parsed, { name: "nom", lat: "lat", lng: "lng" }, REASONS);

    expect(row?.ok).toBe(true);
    if (!row?.ok) return;
    expect(row.row.lat).toBeCloseTo(45.7578);
    expect(row.row.lng).toBeCloseTo(4.832);
  });

  it("rejects a row with no name, and says which line", () => {
    const parsed = parseCsv("nom,adresse\n,7 rue Mercière\nChez Léa,4 place Bellecour\n");
    const rows = mapRows(parsed, { name: "nom", address: "adresse" }, REASONS);

    expect(rows[0]).toMatchObject({ ok: false, line: 1, reason: "Nom manquant" });
    // The address still comes through, so the admin can find the line.
    expect(rows[0]).toMatchObject({ address: "7 rue Mercière" });
    expect(rows[1]?.ok).toBe(true);
  });

  it("accepts a row with no coordinates", () => {
    // ingestion.md: allowed. It appears on the round without distance ordering.
    const parsed = parseCsv("nom\nLa Cantine Mobile\n");
    const [row] = mapRows(parsed, { name: "nom" }, REASONS);
    expect(row?.ok).toBe(true);
    if (!row?.ok) return;
    expect(row.row.lat).toBeNull();
  });

  it("falls back to the default type rather than rejecting an unknown one", () => {
    const parsed = parseCsv("nom,cat\nChez Léa,gastronomique\n");
    const [row] = mapRows(parsed, { name: "nom", type: "cat" }, REASONS);
    expect(row?.ok).toBe(true);
    if (!row?.ok) return;
    expect(row.row.type).toBe("other");
  });

  it("rejects coordinates outside the world", () => {
    const parsed = parseCsv("nom,lat,lng\nChez Léa,999,4.83\n");
    const [row] = mapRows(parsed, { name: "nom", lat: "lat", lng: "lng" }, REASONS);
    expect(row).toMatchObject({ ok: false, reason: "Ligne invalide" });
  });

  it("leaves an unmapped field out entirely", () => {
    // Which is what stops an unmapped column erasing stored data on re-import.
    const parsed = parseCsv("nom,tel\nChez Léa,0478111111\n");
    const [row] = mapRows(parsed, { name: "nom" }, REASONS);
    expect(row?.ok).toBe(true);
    if (!row?.ok) return;
    expect(row.row.phone).toBeNull();
  });
});

describe("batched", () => {
  it("splits to the cap and keeps order", () => {
    const rows = Array.from({ length: 501 }, (_, i) => i);
    const batches = batched(rows, 250);
    expect(batches.map((b) => b.length)).toEqual([250, 250, 1]);
    expect(batches[2]?.[0]).toBe(500);
  });

  it("returns nothing for an empty list", () => {
    expect(batched([], 250)).toEqual([]);
  });
});

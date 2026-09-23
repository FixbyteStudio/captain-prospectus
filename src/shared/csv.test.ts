import { describe, expect, it } from "vitest";
import {
  CSV_ATTRIBUTION,
  csvDisposition,
  csvField,
  csvFile,
  csvFilename,
  csvRow,
  csvTimestamp,
} from "./csv";

describe("csvField", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvField("Le Bistrot")).toBe("Le Bistrot");
    expect(csvField(42)).toBe("42");
    expect(csvField(true)).toBe("true");
  });

  it("writes null and undefined as empty, never the text null", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("quotes a value containing a comma", () => {
    expect(csvField("Rue Neuve 1, Bruxelles")).toBe('"Rue Neuve 1, Bruxelles"');
  });

  it("quotes and doubles an embedded quote", () => {
    expect(csvField('Le "Vrai" Bistrot')).toBe('"Le ""Vrai"" Bistrot"');
  });

  it("quotes a value containing a newline", () => {
    expect(csvField("patron absent\nrepasser jeudi")).toBe('"patron absent\nrepasser jeudi"');
  });

  /**
   * Pins current behaviour, deliberately. A leading `=` is a formula to Excel,
   * and refusing it is a decision about who our reader is, not a bug fix
   * (docs/backlog/001 puts it out of scope).
   */
  it("does not escape a leading = (formula injection is out of scope)", () => {
    expect(csvField("=1+1")).toBe("=1+1");
  });
});

describe("csvFile", () => {
  it("writes a header, rows and the attribution, CRLF separated", () => {
    const out = csvFile(["name", "status"], [["Le Bistrot", "new"]], CSV_ATTRIBUTION);
    expect(out).toBe(`name,status\r\nLe Bistrot,new\r\n${CSV_ATTRIBUTION}\r\n`);
  });

  it("is header plus attribution when there are no rows", () => {
    const out = csvFile(["name"], [], CSV_ATTRIBUTION);
    expect(out).toBe(`name\r\n${CSV_ATTRIBUTION}\r\n`);
  });

  it("omits the trailer when none is given", () => {
    expect(csvFile(["a"], [["b"]])).toBe("a\r\nb\r\n");
  });

  /** A note with all three hazards must still parse as exactly one row. */
  it("keeps a hostile note inside one record", () => {
    const note = 'il a dit « non, merci »,\nrappeler en "septembre"';
    const out = csvFile(["notes", "outcome"], [[note, "not_interested"]]);
    // One embedded newline, inside quotes: three physical lines, two records.
    const [header, ...rest] = out.trimEnd().split("\r\n");
    expect(header).toBe("notes,outcome");
    expect(rest.join("\r\n")).toBe(`"${note.replaceAll('"', '""')}",not_interested`);
  });
});

describe("csvRow", () => {
  it("joins escaped cells with commas", () => {
    expect(csvRow(["a", null, "c,d"])).toBe('a,,"c,d"');
  });
});

describe("csvTimestamp", () => {
  it("writes ISO-8601 UTC, because a spreadsheet cannot read epoch ms", () => {
    expect(csvTimestamp(1_700_000_000_000)).toBe("2023-11-14T22:13:20.000Z");
  });

  it("writes an absent timestamp as empty", () => {
    expect(csvTimestamp(null)).toBe("");
    expect(csvTimestamp(undefined)).toBe("");
  });
});

describe("csvFilename and csvDisposition", () => {
  it("dates the file from the request time in UTC", () => {
    expect(csvFilename("prospects", Date.UTC(2026, 8, 23, 14, 30))).toBe(
      "prospects-2026-09-23.csv",
    );
  });

  it("quotes the filename in the header", () => {
    expect(csvDisposition("visits-2026-09-23.csv")).toBe(
      'attachment; filename="visits-2026-09-23.csv"',
    );
  });
});

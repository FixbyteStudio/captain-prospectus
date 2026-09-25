/**
 * Every quoted string literal in a TS/TSX source file — shared by
 * `palette.test.ts`'s component tier and `safe-area.test.ts`, both of which
 * scan `className`/`cn()` strings without a DOM.
 *
 * A naive `/(["'`])(...)*\1/` scan (and stripping `/* … *\/` comments first)
 * both break on real code: `useMatch("/tournee/*")` contains a `/*` inside a
 * *string*, which a comment-stripper reads as a comment start, and a prose
 * apostrophe ("it's") reads as a string start — either way, everything up to
 * the next matching character is swallowed into one bogus "literal",
 * silently losing the real `className` strings on either side of it. This is
 * a small hand-rolled scanner instead: one pass, tracking only "am I inside a
 * `//` comment, a `/* *\/` comment, or a quoted string right now", which is
 * enough to find real string boundaries without a full parser.
 */
export function classLiterals(source: string): string[] {
  const literals: string[] = [];
  const n = source.length;
  let i = 0;

  while (i < n) {
    const two = source.slice(i, i + 2);

    if (two === "//") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? n : end + 1;
      continue;
    }

    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }

    const quote = source[i];
    if (quote === '"' || quote === "'" || quote === "`") {
      let j = i + 1;
      let value = "";
      while (j < n && source[j] !== quote) {
        const char = source[j] ?? "";
        if (char === "\\" && j + 1 < n) {
          value += char + (source[j + 1] ?? "");
          j += 2;
          continue;
        }
        value += char;
        j += 1;
      }
      literals.push(value);
      i = j + 1;
      continue;
    }

    i += 1;
  }

  return literals;
}

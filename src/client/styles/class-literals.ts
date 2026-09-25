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
  return classLiteralGroups(source).flat();
}

/**
 * The same scan as `classLiterals`, but grouped one array per
 * `className={cn(...)}` expression's string arguments — `cn()` merges them
 * onto one element at runtime, so a padding utility in one argument can
 * still collide with `safe-top`/`safe-bottom` in a sibling one (GH #67
 * review: `FieldTabs.tsx`'s wrapper div sets `.safe-bottom` in `cn()`'s first
 * argument and `md:contents` in its second — two separate literals, one
 * rendered element). A plain `className="…"` string is its own group of one;
 * anything else (an import path, an `aria-label`) is too, harmlessly, since
 * neither ever carries a padding or safe-area token.
 *
 * `cn(` is matched by name, not by import — case-sensitive and requiring a
 * non-identifier character (or start of file) before it, so this does not
 * also swallow an unrelated call like `fn(` or `warnCn(`.
 */
export function classLiteralGroups(source: string): string[][] {
  const groups: string[][] = [];
  const stack: { depth: number; group: string[] }[] = [];
  let parenDepth = 0;
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
      if (stack.length > 0) stack[stack.length - 1]?.group.push(value);
      else groups.push([value]);
      i = j + 1;
      continue;
    }

    if (quote === "(") {
      const isCnCall =
        source.slice(Math.max(0, i - 2), i) === "cn" && !/[A-Za-z0-9_$]/.test(source[i - 3] ?? "");
      parenDepth += 1;
      if (isCnCall) stack.push({ depth: parenDepth, group: [] });
      i += 1;
      continue;
    }
    if (quote === ")") {
      const top = stack.at(-1);
      if (top && top.depth === parenDepth) {
        stack.pop();
        groups.push(top.group);
      }
      parenDepth -= 1;
      i += 1;
      continue;
    }

    i += 1;
  }

  // An unterminated cn( should not happen in valid source; report whatever it
  // collected rather than dropping it silently.
  for (const entry of stack) groups.push(entry.group);

  return groups;
}

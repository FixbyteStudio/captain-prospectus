import { describe, expect, it } from "vitest";
import { classLiterals } from "./class-literals";

/**
 * `classLiterals` is the load-bearing part of both class-string scanners
 * (`palette.test.ts`'s component tier, `safe-area.test.ts`): when it
 * mis-segments a file it does not throw, it silently returns *fewer* literals,
 * and every scanner built on it passes by seeing less. The cases below are the
 * ones that broke the naive regex it replaced (GH #67).
 */
describe("classLiterals", () => {
  it("keeps a /* inside a string from reading as a comment", () => {
    // The original bug: `useMatch("/tournee/*")` opened a comment that ate
    // every className after it.
    const source = `useMatch("/tournee/*");\nconst a = "safe-bottom px-4 py-6";`;
    expect(classLiterals(source)).toEqual(["/tournee/*", "safe-bottom px-4 py-6"]);
  });

  it("keeps an apostrophe inside a comment from opening a string", () => {
    const source = `// it's a comment\nconst a = "px-4 py-6";`;
    expect(classLiterals(source)).toEqual(["px-4 py-6"]);
  });

  it("ignores a block comment's contents entirely", () => {
    const source = `/* "bg-primary" mentioned in prose */\nconst a = "bg-primary border-primary-edge";`;
    expect(classLiterals(source)).toEqual(["bg-primary border-primary-edge"]);
  });

  it("reads all three quote styles", () => {
    expect(classLiterals(`const a = "x"; const b = 'y'; const c = \`z\`;`)).toEqual([
      "x",
      "y",
      "z",
    ]);
  });

  it("does not end a literal on an escaped quote", () => {
    expect(classLiterals(`const a = "say \\"hi\\" now";`)).toEqual([`say \\"hi\\" now`]);
  });

  it("finds every literal in a realistic variant object", () => {
    const source = [
      "const badgeVariants = cva(",
      '  "inline-flex border border-transparent",',
      "  {",
      "    variants: {",
      "      variant: {",
      '        default: "bg-primary text-primary-foreground border-primary-edge",',
      '        destructive: "bg-destructive text-destructive-foreground",',
      "      },",
      "    },",
      "  },",
      ");",
    ].join("\n");
    expect(classLiterals(source)).toContain(
      "bg-primary text-primary-foreground border-primary-edge",
    );
    expect(classLiterals(source)).toContain("bg-destructive text-destructive-foreground");
  });
});

/**
 * `check-precache.mjs` matches its admin-only list against these names, so a
 * wrong name (a bare `@tanstack`, a raw `.pnpm/...` path) would make the leak
 * check match nothing while CI stays green (GH #95).
 */
import { describe, expect, it } from "vitest";
import { chunkModuleName } from "./chunk-module-name.ts";

const ROOT = "/repo/";

describe("chunkModuleName", () => {
  it.each([
    [
      "an unscoped pnpm package",
      `${ROOT}node_modules/.pnpm/cmdk@1.1.1_x/node_modules/cmdk/dist/index.mjs`,
      "cmdk",
    ],
    [
      "a scoped pnpm package",
      `${ROOT}node_modules/.pnpm/@tanstack+react-query@5.103.2_react@19/node_modules/@tanstack/react-query/build/modern/index.js`,
      "@tanstack/react-query",
    ],
    ["a \\0-prefixed virtual id", "\0vite/preload-helper.js", "vite/preload-helper.js"],
    [
      "a ?query suffix",
      `${ROOT}node_modules/papaparse/papaparse.min.js?commonjs-es-import`,
      "papaparse",
    ],
    ["a repo source path", `${ROOT}src/client/App.tsx`, "src/client/App.tsx"],
    [
      "an id outside the repo",
      "/@vite-plugin-pwa/virtual:pwa-register/react",
      "/@vite-plugin-pwa/virtual:pwa-register/react",
    ],
  ])("reduces %s", (_label, id, expected) => {
    expect(chunkModuleName(id, ROOT)).toBe(expected);
  });

  it("accepts a repo root without a trailing slash", () => {
    expect(chunkModuleName(`${ROOT}src/client/App.tsx`, "/repo")).toBe("src/client/App.tsx");
  });
});

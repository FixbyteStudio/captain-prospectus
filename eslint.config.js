import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "drizzle", ".wrangler", "worker-configuration.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // CLAUDE.md code conventions: no `any`, no unexplained non-null assertions.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["src/client/**/*.tsx"],
    ...reactHooks.configs.flat["recommended-latest"],
  },
  {
    // Build and tooling scripts run in Node, not in workerd or a browser.
    files: ["scripts/**/*.mjs", "*.config.ts", "*.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    // src/shared is imported by the Worker: no DOM, no Worker-only globals.
    files: ["src/shared/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "window", message: "src/shared must stay pure (CLAUDE.md)." },
        { name: "document", message: "src/shared must stay pure (CLAUDE.md)." },
        { name: "localStorage", message: "src/shared must stay pure (CLAUDE.md)." },
        { name: "caches", message: "src/shared must stay pure (CLAUDE.md)." },
      ],
    },
  },
);

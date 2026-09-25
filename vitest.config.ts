import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

// The worker tests build their database from the real migrations, so a
// migration that does not apply fails CI instead of production.
const migrations = await readD1Migrations("./drizzle");

/**
 * Three projects, because the three kinds of test need different runtimes:
 *  - "unit"   shared pure code and the client sync engine, with fake-indexeddb
 *  - "worker" routes against a real local D1 inside workerd
 *  - "dom"    components in happy-dom with Testing Library (GH #83)
 *
 * `.test.ts` versus `.test.tsx` is the whole selector between "unit" and
 * "dom": vitest 4 dropped `environmentMatchGlobs`, and a separate project
 * keeps the node tests' own `include` untouched so nothing about the existing
 * suite changes when a component test is added.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/shared/**/*.test.ts", "src/client/**/*.test.ts", "config.test.ts"],
          setupFiles: ["./test/setup-unit.ts"],
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              d1Databases: ["DB"],
              bindings: {
                TEST_MIGRATIONS: migrations,
                // Local-only identity, exactly as .dev.vars does in development.
                DEV_USER_EMAIL: "admin@example.com",
                ADMIN_EMAILS: "admin@example.com",
                AGENT_EMAILS: "agent@example.com",
              },
            },
          }),
        ],
        test: {
          name: "worker",
          include: ["src/worker/**/*.test.ts"],
          setupFiles: ["./test/setup-worker.ts"],
        },
      },
      {
        // The React plugin, for JSX in the components under test and in the
        // tests themselves. The root config's plugins are not inherited by a
        // project, and neither are its aliases — hence both below.
        plugins: [react()],
        resolve: {
          alias: {
            // Mirrors vite.config.ts and tsconfig.client.json: shadcn writes
            // its imports as "@/ui/button".
            "@": fileURLToPath(new URL("./src/client", import.meta.url)),
            // VitePWA is not in this pipeline, so its virtual module has to
            // come from somewhere: src/client/pwa.ts imports it, and App.tsx
            // imports that.
            "virtual:pwa-register/react": fileURLToPath(
              new URL("./test/stubs/pwa-register.ts", import.meta.url),
            ),
          },
        },
        test: {
          name: "dom",
          // happy-dom rather than jsdom: it drives the Radix dropdown and
          // alert dialog and cmdk's command palette in these tests, and it
          // installs faster in CI.
          environment: "happy-dom",
          // Not scoped to src/client: a component test written anywhere
          // else would match no project at all and be silently skipped.
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./test/setup-dom.ts"],
        },
      },
    ],
  },
});

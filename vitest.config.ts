import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

// The worker tests build their database from the real migrations, so a
// migration that does not apply fails CI instead of production.
const migrations = await readD1Migrations("./drizzle");

/**
 * Two projects, because the two sides need different runtimes:
 *  - "unit"   shared pure code and the client sync engine, with fake-indexeddb
 *  - "worker" routes against a real local D1 inside workerd
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
    ],
  },
});

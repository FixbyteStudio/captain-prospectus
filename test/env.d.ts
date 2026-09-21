import type { D1Migration } from "cloudflare:test";

/**
 * Bindings that exist only under test, merged into the generated Cloudflare.Env
 * (see worker-configuration.d.ts). They are set in vitest.config.ts.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      DEV_USER_EMAIL?: string;
    }
  }
}

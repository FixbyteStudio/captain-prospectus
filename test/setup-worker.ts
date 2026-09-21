import { applyD1Migrations, env } from "cloudflare:test";

// Every worker test starts against a database built by the real migrations,
// so a migration that does not apply fails the suite rather than production.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

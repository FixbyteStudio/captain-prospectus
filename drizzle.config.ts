import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/worker/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "d1-http",
  casing: "snake_case",
});

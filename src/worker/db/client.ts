import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

export type Db = ReturnType<typeof getDb>;

/** JSON is camelCase, SQL is snake_case; Drizzle maps them via `casing`. */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema, casing: "snake_case" });
}

export { schema };

/**
 * Bound parameters a multi-row insert uses per row, for chunk().
 *
 * Derived from the table rather than hand-counted: Drizzle binds at most one
 * parameter per column, so the column count is a safe upper bound, and a column
 * added to the schema can never silently push a statement over D1's limit of
 * 100 (INVARIANT 7).
 */
export function boundParamsPerRow(table: SQLiteTable): number {
  return Object.keys(getTableColumns(table)).length;
}

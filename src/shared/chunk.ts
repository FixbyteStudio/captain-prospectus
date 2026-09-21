import { D1_MAX_BOUND_PARAMS } from "./constants";

/**
 * Split rows into batches small enough for one D1 statement.
 *
 * INVARIANT 7: D1 accepts at most 100 bound parameters per statement. A
 * multi-row insert binds `columnsPerRow` parameters per row, so a batch may
 * hold at most floor(100 / columnsPerRow) rows.
 */
export function chunk<T>(rows: readonly T[], columnsPerRow: number): T[][] {
  if (columnsPerRow < 1) throw new Error("columnsPerRow must be at least 1");
  if (columnsPerRow > D1_MAX_BOUND_PARAMS) {
    throw new Error(
      `a single row binds ${columnsPerRow} parameters, over D1's limit of ${D1_MAX_BOUND_PARAMS}`,
    );
  }
  const size = Math.floor(D1_MAX_BOUND_PARAMS / columnsPerRow);
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

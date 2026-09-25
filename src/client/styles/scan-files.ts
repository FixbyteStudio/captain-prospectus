import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every `.ts`/`.tsx` file under `dir`, excluding tests — shared by
 * `palette.test.ts`'s component tier and `safe-area.test.ts`, both of which
 * scan real source rather than a hand-written file list (GH #67 review: a
 * scanner limited to `src/client/ui/` cannot see a violation in `App.tsx` or
 * `FieldTabs.tsx`).
 */
export function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSourceFiles(full));
    } else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\.(tsx|ts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

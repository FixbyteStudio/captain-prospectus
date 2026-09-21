/**
 * INVARIANT 6: every request body is validated with a schema from
 * src/shared/schemas.ts. This is the only place a zod error becomes a response,
 * so the shape of a 400 is identical everywhere (docs/api.md).
 */
import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";
import type { ValidationTargets } from "hono";

export function validate<T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "validation", issues: result.error.issues }, 400);
    }
    return undefined;
  });
}

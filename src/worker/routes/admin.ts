/**
 * Admin routes — docs/api.md.
 *
 * The surface is declared here with its schemas wired from day one so the
 * contract is visible and typed; the bodies land in M1–M4 (docs/roadmap.md).
 * Each stub answers 501 rather than pretending to succeed.
 */
import { Hono } from "hono";
import {
  assignSchema,
  overpassImportSchema,
  prospectBatchSchema,
  prospectPatchSchema,
  scriptCreateSchema,
} from "../../shared/schemas";
import { validate } from "../validate";
import type { AppEnv } from "../types";

export const adminRoutes = new Hono<AppEnv>();

const notYet = (milestone: string) =>
  ({ error: "not_implemented", message: `Arrive en ${milestone}.` }) as const;

adminRoutes.get("/prospects", (c) => c.json(notYet("M1"), 501));

adminRoutes.post("/prospects/batch", validate("json", prospectBatchSchema), (c) =>
  c.json(notYet("M1"), 501),
);

adminRoutes.patch("/prospects/:id", validate("json", prospectPatchSchema), (c) =>
  c.json(notYet("M1"), 501),
);

adminRoutes.post("/prospects/assign", validate("json", assignSchema), (c) =>
  c.json(notYet("M1"), 501),
);

adminRoutes.post("/import/overpass", validate("json", overpassImportSchema), (c) =>
  c.json(notYet("M4"), 501),
);

adminRoutes.get("/visits", (c) => c.json(notYet("M4"), 501));

adminRoutes.get("/scripts", (c) => c.json(notYet("M3"), 501));

adminRoutes.post("/scripts", validate("json", scriptCreateSchema), (c) =>
  c.json(notYet("M3"), 501),
);

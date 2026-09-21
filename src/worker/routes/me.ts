import { Hono } from "hono";
import type { MeResponse } from "../../shared/schemas";
import type { AppEnv } from "../types";

export const meRoutes = new Hono<AppEnv>();

/** Who am I, and may I see the admin screens? */
meRoutes.get("/", (c) => {
  const { email, role } = c.get("identity");
  return c.json<MeResponse>({ email, role });
});

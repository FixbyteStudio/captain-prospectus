/**
 * The whole backend: one Worker, one deploy (ADR-0003).
 *
 * `/api/*` is handled here; everything else falls through to Workers Static
 * Assets, which serves the Vite build with SPA fallback. `run_worker_first` in
 * wrangler.jsonc lists only "/api/*", so asset requests never invoke this
 * Worker and stay free (INVARIANT 14).
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAdmin, requireIdentity } from "./auth";
import { adminRoutes } from "./routes/admin";
import { agentRoutes } from "./routes/agent";
import { devRoutes } from "./routes/dev";
import { meRoutes } from "./routes/me";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>().basePath("/api");

/** Local-only; the route itself 404s off localhost. Mounted before auth. */
app.route("/dev", devRoutes);

// INVARIANT 10: every /api request carries a verified Access identity.
app.use("/*", requireIdentity);

app.route("/me", meRoutes);
app.route("/agent", agentRoutes);
app.use("/admin/*", requireAdmin);
app.route("/admin", adminRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();

  // D1's free-tier daily limits are enforced: past them, queries fail until
  // midnight UTC. Say so plainly — an agent must know their outbox is intact
  // and that retrying later will work, not read a 500 as lost data.
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("free tier daily row")) {
    return c.json(
      {
        error: "quota",
        message:
          "Quota quotidien de la base atteint. Vos visites sont conservées, réessayez plus tard.",
      },
      503,
    );
  }

  console.error("unhandled error", message);
  return c.json({ error: "internal", message: "Une erreur est survenue. Réessayez." }, 500);
});

export default app;

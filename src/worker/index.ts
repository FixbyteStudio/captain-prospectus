/**
 * The whole backend: one Worker, one deploy (ADR-0003).
 *
 * `/api/*` is handled here; everything else falls through to Workers Static
 * Assets, which serves the Vite build with SPA fallback. `run_worker_first` in
 * wrangler.jsonc lists only "/api/*", so asset requests never invoke this
 * Worker and stay free (INVARIANT 14).
 */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { MAX_REQUEST_BYTES } from "../shared/constants";
import { requireAdmin, requireIdentity } from "./auth";
import { getDb } from "./db/client";
import { describeSweep, runRetention } from "./retention";
import { adminRoutes } from "./routes/admin";
import { agentRoutes } from "./routes/agent";
import { devRoutes } from "./routes/dev";
import { meRoutes } from "./routes/me";
import type { AppEnv, Bindings } from "./types";

const app = new Hono<AppEnv>().basePath("/api");

/**
 * INVARIANT 13 and docs/security.md: refuse an oversized body before anything
 * parses it.
 *
 * Registered FIRST, and that is load-bearing. Hono composes matched handlers in
 * registration order, so a middleware added below the /dev mount would sit
 * *after* the dev handler in the chain and never run — and /api/dev/* is the one
 * route mounted before auth. It also has to precede the sync route's
 * requireSupportedClientVersion, which reads the body: Hono caches the request
 * text on first read, so a cap placed after it would be checking a body that had
 * already been buffered.
 *
 * onError is handled here rather than in app.onError because hono's default
 * throws an HTTPException carrying a plain-text "Payload Too Large" response,
 * which the handler below passes straight through. This is the only place the
 * JSON shape can be fixed.
 */
app.use(
  "/*",
  bodyLimit({
    maxSize: MAX_REQUEST_BYTES,
    onError: (c) =>
      c.json(
        {
          error: "too_large",
          message: "Requête trop volumineuse. Envoyez moins de données à la fois.",
        },
        413,
      ),
  }),
);

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

/**
 * Two entry points, one Worker.
 *
 * `fetch` is the API above. `scheduled` is the daily retention sweep (ADR-0023)
 * — the one thing in this app that writes to `visits`, and the reason that
 * table's append-only rule now carries an exception.
 *
 * It fails quietly by nature: if the cron stops firing nothing breaks and
 * nobody notices, so it logs what it did on every run and the release
 * checklist looks for that line.
 */
export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        try {
          const result = await runRetention(getDb(env.DB), Date.now());
          console.log(describeSweep(result));
        } catch (err) {
          // Never throw out of a cron: a failed sweep must not retry in a loop
          // against the D1 daily quota. Tomorrow's run picks up the same rows,
          // because the sweep is idempotent and the backlog is still there.
          console.error("retention sweep failed", err instanceof Error ? err.message : String(err));
        }
      })(),
    );
  },
} satisfies ExportedHandler<Bindings>;

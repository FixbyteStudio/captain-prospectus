import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { apiFetch } from "./api";
import { copy } from "./copy";
import { cn } from "./lib/utils";
import type { MeResponse } from "../shared/schemas";
import { buttonVariants } from "@/ui/button-variants";
import { usePwa, type PwaState } from "./pwa";
import { TodayScreen } from "./field/TodayScreen";
import { SyncDot, SyncStrip } from "./field/SyncIndicator";
import { SyncProvider } from "./field/useSync";
import { clearAgentCache, fieldDb, getMeta, setMeta } from "./field/db";
import { resolveIdentity } from "./field/identity";

/**
 * The admin side is a separate chunk, fetched only when an admin opens one of
 * its routes.
 *
 * An agent's phone is the constraint: it loads this app outdoors on a bad
 * connection to log a visit, and it has no business downloading TanStack Query,
 * Radix, sonner and PapaParse to do it (vision.md; the bundle note in
 * ADR-0014). The field screens stay in the entry chunk for that reason.
 *
 * `lazy` wants a default export and this repo uses named ones, hence the remap.
 */
const AdminApp = lazy(() =>
  import("./admin/AdminApp").then((module) => ({ default: module.AdminApp })),
);

/**
 * The round is what an agent needs the moment the app opens; the visit form
 * and add-prospect form are one tap away from it. Splitting them out is what
 * ADR-0014's own consequence asks for when the entry chunk crosses its budget
 * ("split further before adding to it") — measured at the end of M2, this is
 * that split.
 *
 * The service worker precaches every chunk regardless (workbox `generateSW`
 * globs `**\/*.js`), so this does not change what an agent downloads on
 * install or how the app behaves with no signal — VisitScreen is still
 * reachable offline the instant the round loads. It changes only how much JS
 * runs before the first paint of the list itself.
 */
const VisitScreen = lazy(() =>
  import("./field/VisitScreen").then((module) => ({ default: module.VisitScreen })),
);
const AddProspectScreen = lazy(() =>
  import("./field/AddProspectScreen").then((module) => ({ default: module.AddProspectScreen })),
);

function BandLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "inline-flex h-8 shrink-0 items-center rounded-md px-2.5 font-medium transition-colors",
          isActive
            ? "bg-band-foreground/10 text-band-foreground"
            : "text-band-muted hover:text-band-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}

/**
 * A new build is waiting. `registerType` is "prompt" (vite.config.ts), so the
 * agent decides when to take it rather than being reloaded mid-round.
 *
 * The registration itself is deliberately *not* done here. This component
 * renders only once `/api/me` has settled, and a phone whose first load fails
 * to identify would then never register a worker at all — which is exactly the
 * phone that most needs one, since without it there is nothing cached to open
 * offline next time. `App` holds the hook; this only draws the prompt.
 */
function UpdatePrompt({ pwa }: { pwa: PwaState }) {
  const { needRefresh, update, dismiss } = pwa;
  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="bg-secondary border-border flex items-center justify-between gap-3 border-b px-4 py-2"
    >
      <span className="text-sm">{copy.update.available}</span>
      <span className="flex shrink-0 gap-2">
        <button
          type="button"
          className={buttonVariants({ size: "sm", variant: "ghost" })}
          onClick={dismiss}
        >
          {copy.update.dismiss}
        </button>
        <button type="button" className={buttonVariants({ size: "sm" })} onClick={update}>
          {copy.update.apply}
        </button>
      </span>
    </div>
  );
}

/** The field routes, which every role can reach. */
function FieldRoutes() {
  return (
    <Routes>
      {/* Relative to the parent's /tournee/*. "nouveau" comes before ":id" so
          it is never read as a prospect id. */}
      <Route index element={<TodayScreen />} />
      <Route
        path="nouveau"
        element={
          <Suspense fallback={<p className="text-muted-foreground" aria-busy="true" />}>
            <AddProspectScreen />
          </Suspense>
        }
      />
      <Route
        path=":id"
        element={
          <Suspense fallback={<p className="text-muted-foreground" aria-busy="true" />}>
            <VisitScreen />
          </Suspense>
        }
      />
    </Routes>
  );
}

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** True when the identity came from the cache rather than from the server. */
  const [offline, setOffline] = useState(false);

  // Registers the service worker on mount, before and regardless of whether
  // `/api/me` answers. See the note on `UpdatePrompt`.
  const pwa = usePwa();

  /**
   * Identity, with an offline fallback — but only for genuine unreachability.
   *
   * The whole product is "an agent can log a visit with no network", so the
   * shell must not be the thing that blocks on one. The branching itself
   * lives in `field/identity.ts`, tested there; this effect only runs the
   * fetch, reads the cache, and applies whatever it decides.
   */
  useEffect(() => {
    let cancelled = false;

    const settle = async (result: Parameters<typeof resolveIdentity>[0]) => {
      const cached = await getMeta(fieldDb, "identity");
      if (cancelled) return;
      const outcome = resolveIdentity(result, cached);

      if (outcome.kind === "error") {
        // A 401 is the Worker revoking this identity. The cache it would
        // otherwise be read from offline goes with it, or airplane mode hands
        // the round straight back (docs/domains/identity-access.md). The
        // outbox stays: INVARIANT 5.
        if (outcome.revoked) await clearAgentCache(fieldDb);
        if (cancelled) return;
        setError(outcome.message);
        return;
      }
      // A different agent signed in on this device since the last cached
      // identity: their round and visit-history cache are not this agent's
      // to see (docs/security.md: "Agent reading other agents' data"). The
      // outbox is never touched here — INVARIANT 5 — see backlog/005 for the
      // residual gap that leaves (a queued visit written under the previous
      // identity still syncs under this one).
      if (outcome.identitySwitched) {
        await clearAgentCache(fieldDb);
      }
      setMe(outcome.identity);
      setOffline(outcome.offline);
      // The cached copy is never treated as proof, online or offline: the
      // Worker re-derives identity from the verified Access JWT on every
      // request (INVARIANT 10). Only overwrite the cache with a live answer,
      // never with the cache's own value.
      if (!outcome.offline) void setMeta(fieldDb, "identity", outcome.identity);
    };

    apiFetch<unknown>("/api/me")
      .then((body) => settle({ ok: true, body }))
      .catch((error: unknown) => settle({ ok: false, error }));

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <main className="safe-top px-4 py-6">{error}</main>;
  if (!me) return <main className="safe-top px-4 py-6" aria-busy="true" />;

  // Admin screens are useless without the network, so a cached identity opens
  // the field side only, whatever role it happens to record.
  const isAdmin = me.role === "admin" && !offline;

  return (
    <SyncProvider>
      <header className="safe-top bg-band text-band-foreground flex h-12 items-center gap-3 px-4">
        <img src="/mark.svg" alt="" className="h-7 w-auto shrink-0" />
        <span className="shrink-0 text-[0.9375rem] font-semibold tracking-[0.01em] whitespace-nowrap">
          {copy.appName}
        </span>
        {/* An admin on a phone has five links and the band is only so wide, so
            the nav scrolls rather than pushing the page sideways. An agent has
            one, and the space goes to the sync state instead. */}
        <nav className="ml-auto flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
          <BandLink to="/tournee">{copy.nav.today}</BandLink>
          {isAdmin && <BandLink to="/admin/prospects">{copy.nav.prospects}</BandLink>}
          {isAdmin && <BandLink to="/admin/import">{copy.nav.import}</BandLink>}
          {isAdmin && <BandLink to="/admin/doublons">{copy.nav.duplicates}</BandLink>}
          {isAdmin && <BandLink to="/admin/visites">{copy.nav.visits}</BandLink>}
          {isAdmin && <BandLink to="/admin/scripts">{copy.nav.scripts}</BandLink>}
        </nav>
        <SyncDot />
      </header>

      <UpdatePrompt pwa={pwa} />
      <SyncStrip />

      <main className="safe-bottom px-4 py-6">
        <Routes>
          <Route
            path="/"
            element={<Navigate to={isAdmin ? "/admin/prospects" : "/tournee"} replace />}
          />
          <Route path="/tournee/*" element={<FieldRoutes />} />
          <Route
            path="/admin/*"
            element={
              isAdmin ? (
                <Suspense fallback={<p className="text-muted-foreground" aria-busy="true" />}>
                  <AdminApp />
                </Suspense>
              ) : (
                <p className="text-muted-foreground">{copy.errors.forbidden}</p>
              )
            }
          />
          <Route
            path="*"
            element={<p className="text-muted-foreground">{copy.errors.notFound}</p>}
          />
        </Routes>
      </main>
    </SyncProvider>
  );
}

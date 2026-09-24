import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router";
import { apiFetch } from "./api";
import { BandBrand, BandLink, UpdatePrompt } from "./Band";
import { copy } from "./copy";
import type { MeResponse } from "../shared/schemas";
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

/**
 * The field-only band. Admin screens get their own frame instead of this one:
 * `AdminApp` renders as a sibling route, not nested inside `FieldFrame`.
 */
function FieldFrame({ isAdmin, pwa }: { isAdmin: boolean; pwa: PwaState }) {
  return (
    <>
      <header className="safe-top bg-band text-band-foreground flex h-12 items-center gap-3 px-4">
        <BandBrand />
        {/* An admin on a phone has one extra link into the admin side; an
            agent has none. Either way the nav scrolls rather than pushing the
            page sideways, and the rest of the space goes to the sync state. */}
        <nav className="ml-auto flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
          <BandLink to="/tournee">{copy.nav.today}</BandLink>
          {isAdmin && <BandLink to="/admin/prospects">{copy.nav.prospects}</BandLink>}
        </nav>
        <SyncDot />
      </header>

      <UpdatePrompt pwa={pwa} />
      <SyncStrip />

      <main className="safe-bottom px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}

/**
 * Shown while the lazy admin chunk loads, so an admin sees a band rather than
 * a blank page. Built from entry-chunk pieces only: the real admin frame
 * (`AdminLayout`) lives in the chunk this is standing in for.
 */
function AdminFrameFallback() {
  return (
    <>
      <header className="safe-top bg-band text-band-foreground flex h-12 items-center gap-3 px-4">
        <BandBrand />
      </header>
      <main className="safe-bottom px-4 py-6">
        <p className="text-muted-foreground" aria-busy="true" />
      </main>
    </>
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
      <Routes>
        {/* Not under FieldFrame: the redirect target decides which frame
            shows, so the field band must not render even for one commit. */}
        <Route
          path="/"
          element={<Navigate to={isAdmin ? "/admin/prospects" : "/tournee"} replace />}
        />

        {/* The field-only band. The forbidden and not-found fallbacks live
            here too, since neither screen is admin chrome. */}
        <Route element={<FieldFrame isAdmin={isAdmin} pwa={pwa} />}>
          <Route path="/tournee/*" element={<FieldRoutes />} />
          {!isAdmin && (
            <Route
              path="/admin/*"
              element={<p className="text-muted-foreground">{copy.errors.forbidden}</p>}
            />
          )}
          <Route
            path="*"
            element={<p className="text-muted-foreground">{copy.errors.notFound}</p>}
          />
        </Route>

        {/* Admin screens get their own frame instead of the field band. */}
        {isAdmin && (
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<AdminFrameFallback />}>
                <AdminApp updatePrompt={<UpdatePrompt pwa={pwa} />} />
              </Suspense>
            }
          />
        )}
      </Routes>
    </SyncProvider>
  );
}

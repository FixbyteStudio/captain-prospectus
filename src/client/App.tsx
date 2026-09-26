import { Suspense, lazy, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router";
import { LockIcon, MapPinOffIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { apiFetch } from "./api";
import { Band, BandBrand, UpdatePrompt } from "./Band";
import { copy } from "./copy";
import { initials } from "./format";
import type { MeResponse } from "../shared/schemas";
import { usePwa, type PwaState } from "./pwa";
import { buttonVariants } from "@/ui/button-variants";
import { FieldTabs } from "./field/FieldTabs";
import { LeaveGuardProvider } from "./field/leave-guard";
import { TodayScreen } from "./field/TodayScreen";
import { SyncDot, SyncStrip, useSyncView } from "./field/SyncIndicator";
import { hasReconnectMarker, withoutReconnectMarker } from "./field/reconnect-marker";
import { hidesUpdateBanner } from "./field/sync-view";
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
 * The field-only band: the one frame whose band row carries more than the
 * brand. Admin screens get their own frame instead of this one: `AdminApp`
 * renders as a sibling route, not nested inside `FieldFrame`.
 */
function FieldFrame({ isAdmin, pwa, email }: { isAdmin: boolean; pwa: PwaState; email: string }) {
  // `FieldFrame` also wraps the forbidden and not-found fallbacks (neither is
  // under /tournee), so the subtitle names a tab only when there is one.
  const onTournee = useMatch("/tournee/*");
  const onAddProspect = useMatch("/tournee/nouveau/*");
  const subtitle = onAddProspect
    ? copy.nav.subtitle.add
    : onTournee
      ? copy.nav.subtitle.today
      : undefined;

  // The update-needed strip already says a build is waiting; the banner
  // would repeat it (hidesUpdateBanner, sync-view.ts).
  const hideUpdatePrompt = hidesUpdateBanner(useSyncView());

  return (
    <LeaveGuardProvider>
      <Band>
        <BandBrand subtitle={subtitle} />
        {/* Below 768px this detaches to a fixed bar at the bottom of the
            screen; from 768px it sits right here, in the band's own row.
            Below 768px it is `position: fixed` (out of flow) and claims no
            width here at all, so it cannot push the sync pill and avatar to
            the row's right edge the way the band nav it replaced used to —
            `ml-auto` on the wrapper below does that instead, standing down
            once the tab bar is back in flow and doing that job itself. */}
        <FieldTabs isAdmin={isAdmin} />
        <span className="ml-auto md:ml-0">
          <SyncDot />
        </span>
        {/* Static, no menu (2026-09-24 decision, spec-gh-65): it only names
            who is signed in, which the outbox and every visit already
            assume. */}
        <span
          role="img"
          aria-label={copy.nav.avatar(email)}
          className="bg-primary text-primary-foreground ring-primary-edge flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset"
        >
          {initials(email)}
        </span>
      </Band>

      {!hideUpdatePrompt && <UpdatePrompt pwa={pwa} />}
      <SyncStrip pwa={pwa} />

      {/* .safe-bottom moved to the tab bar (FieldTabs): it is now the
          bottommost fixed element on a phone. .pb-tab-bar (app.css) clears
          its real height plus the inset it carries, so the bar never covers
          the last row of content — a screen with its own action bar
          (VisitScreen, AddProspectScreen) additionally clears that with
          `.pb-action-bar` on its own form. */}
      <main className="px-4 pt-6 pb-tab-bar">
        <Outlet />
      </main>
    </LeaveGuardProvider>
  );
}

/**
 * DESIGN.md's empty-state pattern (a 64px `secondary` icon tile, one line,
 * one button) reused for the field route's fallback screens: not found,
 * forbidden, and the identity error below, which passes no `action` since
 * there is nowhere useful to send an agent who cannot be identified.
 */
function FieldEmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: LucideIcon;
  message: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="bg-secondary text-muted-foreground flex size-16 items-center justify-center rounded-xl">
        <Icon aria-hidden className="size-7" />
      </span>
      <p className="text-heading">{message}</p>
      {action && (
        <Link to={action.to} className={buttonVariants({ variant: "outline", size: "touch" })}>
          {action.label}
        </Link>
      )}
    </div>
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
      <Band>
        <BandBrand />
      </Band>
      <main className="px-4 pt-6 pb-page">
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

  const location = useLocation();
  const navigate = useNavigate();

  // "Se reconnecter" (SyncStrip) navigates here with the marker so the SW's
  // navigateFallbackDenylist sends that one request to the network; once it
  // has landed, the marker has done its job and the visible URL should not
  // keep advertising it. A router navigation (not `history.replaceState`
  // directly) so it does not wipe whatever state react-router already
  // attached to this history entry.
  useEffect(() => {
    if (!hasReconnectMarker(location.search)) return;
    navigate(withoutReconnectMarker(`${location.pathname}${location.search}${location.hash}`), {
      replace: true,
    });
  }, [location, navigate]);

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
      // outbox is never touched here — INVARIANT 5 — and the previous
      // identity's rows in it are held back by `runSync`, which sends only
      // rows stamped with the identity it is given (backlog/005).
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

  if (error) {
    return (
      <>
        <Band>
          <BandBrand />
        </Band>
        <main className="px-4 pt-6 pb-page">
          <FieldEmptyState icon={TriangleAlertIcon} message={error} />
        </main>
      </>
    );
  }
  // An agent should not see a blank, unbranded screen for the moment
  // /api/me is still in flight, so this carries the band too.
  if (!me) {
    return (
      <>
        <Band>
          <BandBrand />
        </Band>
        <main className="px-4 pt-6 pb-page" aria-busy="true" />
      </>
    );
  }

  // Admin screens are useless without the network, so a cached identity opens
  // the field side only, whatever role it happens to record.
  const isAdmin = me.role === "admin" && !offline;

  return (
    <SyncProvider identity={me.email}>
      <Routes>
        {/* Not under FieldFrame: the redirect target decides which frame
            shows, so the field band must not render even for one commit. */}
        <Route
          path="/"
          element={<Navigate to={isAdmin ? "/admin/prospects" : "/tournee"} replace />}
        />

        {/* The field-only band. The forbidden and not-found fallbacks live
            here too, since neither screen is admin chrome. */}
        <Route element={<FieldFrame isAdmin={isAdmin} pwa={pwa} email={me.email} />}>
          <Route path="/tournee/*" element={<FieldRoutes />} />
          {!isAdmin && (
            <Route
              path="/admin/*"
              element={
                <FieldEmptyState
                  icon={LockIcon}
                  message={copy.errors.forbidden}
                  action={{ to: "/tournee", label: copy.visit.back }}
                />
              }
            />
          )}
          <Route
            path="*"
            element={
              <FieldEmptyState
                icon={MapPinOffIcon}
                message={copy.errors.notFound}
                action={{ to: "/tournee", label: copy.visit.back }}
              />
            }
          />
        </Route>

        {/* Admin screens get their own frame instead of the field band. */}
        {isAdmin && (
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<AdminFrameFallback />}>
                <AdminApp email={me.email} updatePrompt={<UpdatePrompt pwa={pwa} />} />
              </Suspense>
            }
          />
        )}
      </Routes>
    </SyncProvider>
  );
}

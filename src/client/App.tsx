import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { apiFetch } from "./api";
import { copy } from "./copy";
import { cn } from "./lib/utils";
import type { MeResponse } from "../shared/schemas";
import { buttonVariants } from "@/ui/button-variants";
import { usePwa } from "./pwa";
import { TodayScreen } from "./field/TodayScreen";
import { VisitScreen } from "./field/VisitScreen";
import { AddProspectScreen } from "./field/AddProspectScreen";
import { SyncDot, SyncStrip } from "./field/SyncIndicator";
import { SyncProvider } from "./field/useSync";

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
 */
function UpdatePrompt() {
  const { needRefresh, update, dismiss } = usePwa();
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
      <Route path="nouveau" element={<AddProspectScreen />} />
      <Route path=":id" element={<VisitScreen />} />
    </Routes>
  );
}

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MeResponse>("/api/me")
      .then(setMe)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : copy.errors.generic));
  }, []);

  if (error) return <main className="safe-top px-4 py-6">{error}</main>;
  if (!me) return <main className="safe-top px-4 py-6" aria-busy="true" />;

  return (
    <SyncProvider agentEmail={me.email}>
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
          {me.role === "admin" && <BandLink to="/admin/prospects">{copy.nav.prospects}</BandLink>}
          {me.role === "admin" && <BandLink to="/admin/import">{copy.nav.import}</BandLink>}
          {me.role === "admin" && <BandLink to="/admin/doublons">{copy.nav.duplicates}</BandLink>}
          {me.role === "admin" && <BandLink to="/admin/visites">{copy.nav.visits}</BandLink>}
        </nav>
        <SyncDot />
      </header>

      <UpdatePrompt />
      <SyncStrip />

      <main className="safe-bottom px-4 py-6">
        <Routes>
          <Route
            path="/"
            element={
              <Navigate to={me.role === "admin" ? "/admin/prospects" : "/tournee"} replace />
            }
          />
          <Route path="/tournee/*" element={<FieldRoutes />} />
          <Route
            path="/admin/*"
            element={
              me.role === "admin" ? (
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

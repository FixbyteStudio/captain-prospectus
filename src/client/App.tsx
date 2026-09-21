import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { apiFetch } from "./api";
import { copy } from "./copy";
import { cn } from "./lib/utils";
import type { MeResponse } from "../shared/schemas";
import { TodayScreen } from "./field/TodayScreen";

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
            ? "bg-white/10 text-band-foreground"
            : "text-band-muted hover:text-band-foreground",
        )
      }
    >
      {children}
    </NavLink>
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
    <>
      <header className="safe-top bg-band text-band-foreground flex h-12 items-center gap-3 px-4">
        <span className="shrink-0 text-[0.9375rem] font-semibold tracking-[0.01em] whitespace-nowrap">
          {copy.appName}
        </span>
        {/* An admin on a phone has four links and the band is only so wide, so
            the nav scrolls rather than pushing the page sideways. The field
            shell gets its own design pass in M2. */}
        <nav className="ml-auto flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
          <BandLink to="/tournee">{copy.nav.today}</BandLink>
          {me.role === "admin" && <BandLink to="/admin/prospects">{copy.nav.prospects}</BandLink>}
          {me.role === "admin" && <BandLink to="/admin/import">{copy.nav.import}</BandLink>}
          {me.role === "admin" && <BandLink to="/admin/visites">{copy.nav.visits}</BandLink>}
        </nav>
      </header>

      <main className="safe-bottom px-4 py-6">
        <Routes>
          <Route
            path="/"
            element={
              <Navigate to={me.role === "admin" ? "/admin/prospects" : "/tournee"} replace />
            }
          />
          <Route path="/tournee" element={<TodayScreen />} />
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
    </>
  );
}

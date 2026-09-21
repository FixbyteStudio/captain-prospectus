import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { copy } from "./copy";
import { cn } from "./lib/utils";
import type { MeResponse } from "../shared/schemas";
import { TodayScreen } from "./field/TodayScreen";
import { ProspectsScreen } from "./admin/ProspectsScreen";
import { ImportScreen } from "./admin/ImportScreen";
import { VisitsScreen } from "./admin/VisitsScreen";
import { Toaster } from "./ui/sonner";

/** ADR-0013: TanStack Query is for the admin side only. The field client's
 *  source of truth is Dexie, and a second cache over the outbox loses visits. */
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

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
                <QueryClientProvider client={queryClient}>
                  <Routes>
                    <Route path="prospects" element={<ProspectsScreen />} />
                    <Route path="import" element={<ImportScreen />} />
                    <Route path="visites" element={<VisitsScreen />} />
                  </Routes>
                  {/* Admin-side only: the field client reports sync state inline. */}
                  <Toaster position="bottom-right" />
                </QueryClientProvider>
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

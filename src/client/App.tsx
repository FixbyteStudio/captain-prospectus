import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { copy } from "./copy";
import type { MeResponse } from "../shared/schemas";
import { TodayScreen } from "./field/TodayScreen";
import { ProspectsScreen } from "./admin/ProspectsScreen";
import { VisitsScreen } from "./admin/VisitsScreen";

/** ADR-0013: TanStack Query is for the admin side only. The field client's
 *  source of truth is Dexie, and a second cache over the outbox loses visits. */
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MeResponse>("/api/me")
      .then(setMe)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : copy.errors.generic));
  }, []);

  if (error) return <main className="app">{error}</main>;
  if (!me) return <main className="app" aria-busy="true" />;

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">{copy.appName}</h1>
        <nav className="app__nav">
          <Link to="/tournee">{copy.nav.today}</Link>
          {me.role === "admin" && <Link to="/admin/prospects">{copy.nav.prospects}</Link>}
          {me.role === "admin" && <Link to="/admin/visites">{copy.nav.visits}</Link>}
        </nav>
      </header>

      <Routes>
        <Route
          path="/"
          element={<Navigate to={me.role === "admin" ? "/admin/prospects" : "/tournee"} replace />}
        />
        <Route path="/tournee" element={<TodayScreen />} />
        <Route
          path="/admin/*"
          element={
            me.role === "admin" ? (
              <QueryClientProvider client={queryClient}>
                <Routes>
                  <Route path="prospects" element={<ProspectsScreen />} />
                  <Route path="visites" element={<VisitsScreen />} />
                </Routes>
              </QueryClientProvider>
            ) : (
              <p>{copy.errors.forbidden}</p>
            )
          }
        />
        <Route path="*" element={<p>{copy.errors.notFound}</p>} />
      </Routes>
    </div>
  );
}

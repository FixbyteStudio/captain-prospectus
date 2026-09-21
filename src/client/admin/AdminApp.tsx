import { Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";
import { DuplicatesScreen } from "./DuplicatesScreen";
import { ProspectsScreen } from "./ProspectsScreen";
import { VisitsScreen } from "./VisitsScreen";
import { ImportScreen } from "./import/ImportScreen";

/**
 * The whole admin side behind one lazy boundary.
 *
 * This is the only module that reaches TanStack Query, Radix, sonner and
 * PapaParse, so keeping it out of the entry chunk is what stops a field agent
 * downloading the admin app over a bad connection to log one visit
 * (vision.md, and the bundle note in ADR-0014).
 *
 * ADR-0013: TanStack Query is admin-side only. The field client's source of
 * truth is Dexie, and a second cache over the outbox is how visits get lost —
 * the provider living here rather than in App.tsx is what enforces that.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="prospects" element={<ProspectsScreen />} />
        <Route path="import" element={<ImportScreen />} />
        <Route path="doublons" element={<DuplicatesScreen />} />
        <Route path="visites" element={<VisitsScreen />} />
      </Routes>
      {/* Admin-side only: the field client reports sync state inline. */}
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}

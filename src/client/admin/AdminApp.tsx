import type { ReactNode } from "react";
import { Route, Routes } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { copy } from "../copy";
import { Toaster } from "../ui/sonner";
import { AdminLayout } from "./AdminLayout";
import { DashboardScreen } from "./dashboard/DashboardScreen";
import { DuplicatesScreen } from "./DuplicatesScreen";
import { OrphansScreen } from "./OrphansScreen";
import { ProspectsScreen } from "./ProspectsScreen";
import { VisitsScreen } from "./VisitsScreen";
import { ImportScreen } from "./import/ImportScreen";
import { ScriptsScreen } from "./scripts/ScriptsScreen";
import { createAdminQueryClient } from "./query-client";

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
const queryClient = createAdminQueryClient();

export function AdminApp({ email, updatePrompt }: { email: string; updatePrompt: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminLayout banner={updatePrompt} email={email}>
        <Routes>
          <Route index element={<DashboardScreen />} />
          <Route path="prospects" element={<ProspectsScreen />} />
          <Route path="import" element={<ImportScreen />} />
          <Route path="doublons" element={<DuplicatesScreen />} />
          <Route path="visites" element={<VisitsScreen />} />
          <Route path="a-rattacher" element={<OrphansScreen />} />
          <Route path="scripts" element={<ScriptsScreen />} />
          {/* Inside the admin frame, so a typo keeps the sidebar (#90). */}
          <Route
            path="*"
            element={<p className="text-muted-foreground">{copy.errors.notFound}</p>}
          />
        </Routes>
      </AdminLayout>
      {/* Admin-side only: the field client reports sync state inline. */}
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}

import { MutationCache, QueryClient } from "@tanstack/react-query";
import { adminKeys } from "./queries";

/**
 * The admin side's one QueryClient (ADR-0013: TanStack Query is admin-only).
 *
 * Every successful mutation marks Tableau de bord stale here, in one place,
 * rather than in each hook's `onSuccess` — so a mutation added later cannot
 * forget to, and the dashboard refetches as soon as it is on screen, whatever
 * staleTime a later story sets (GH #107). Not awaited: a mutation resolves
 * without waiting for a refetch.
 */
export function createAdminQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
    mutationCache: new MutationCache({
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: adminKeys.dashboards() });
      },
    }),
  });
  return client;
}

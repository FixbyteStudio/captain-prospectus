/**
 * `useImportBatches` is not a `useMutation`, so the MutationCache in
 * query-client.ts never sees it — its own dashboard invalidation is the only
 * thing that makes Tableau de bord refetch after an import (GH #107).
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAdminQueryClient } from "./query-client";
import { adminKeys, useImportBatches } from "./queries";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useImportBatches", () => {
  it("marks the dashboard stale once an import has run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ created: 1, updated: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const client = createAdminQueryClient();
    client.setQueryData(adminKeys.dashboard(30), { openProspects: 3 });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useImportBatches(), { wrapper });
    await act(() => result.current.start([{ name: "Chez Léa", type: "restaurant" }]));

    expect(client.getQueryState(adminKeys.dashboard(30))?.isInvalidated).toBe(true);
  });
});

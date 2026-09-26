import { describe, expect, it } from "vitest";
import { MutationObserver } from "@tanstack/react-query";
import { createAdminQueryClient } from "./query-client";
import { adminKeys } from "./queries";

describe("createAdminQueryClient", () => {
  it("invalidates every dashboard period after any successful mutation", async () => {
    const client = createAdminQueryClient();
    client.setQueryData(adminKeys.dashboard(30), { openProspects: 3 });
    client.setQueryData(adminKeys.dashboard(7), { openProspects: 3 });
    client.setQueryData(adminKeys.agents(), { agents: [] });

    await new MutationObserver(client, { mutationFn: async () => "assigned" }).mutate();

    expect(client.getQueryState(adminKeys.dashboard(30))?.isInvalidated).toBe(true);
    expect(client.getQueryState(adminKeys.dashboard(7))?.isInvalidated).toBe(true);
    // Only the dashboard: other queries keep their own invalidation rules.
    expect(client.getQueryState(adminKeys.agents())?.isInvalidated).toBe(false);
  });

  it("leaves the dashboard alone when a mutation fails", async () => {
    const client = createAdminQueryClient();
    client.setQueryData(adminKeys.dashboard(30), { openProspects: 3 });

    const failing = new MutationObserver(client, {
      mutationFn: async () => {
        throw new Error("refused");
      },
    });
    await expect(failing.mutate()).rejects.toThrow("refused");

    expect(client.getQueryState(adminKeys.dashboard(30))?.isInvalidated).toBe(false);
  });
});

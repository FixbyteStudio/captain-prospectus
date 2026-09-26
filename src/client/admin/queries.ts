/**
 * Admin data access. TanStack Query lives on this side only (ADR-0013): the
 * field client's source of truth is Dexie, and a second cache over the outbox
 * is how visits get lost.
 */
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "../api";
import { copy } from "../copy";
import { IMPORT_ROWS_PER_REQUEST } from "../../shared/constants";
import { arrivedIds, mergeVisits, nextSince } from "./visits/feed";
import { batched } from "./import/csv";
import type {
  AdminVisit,
  AdminVisitsResponse,
  AgentsResponse,
  AssignResult,
  DashboardResponse,
  DuplicatesResponse,
  ImportResult,
  ImportRow,
  MergeResult,
  AreaSearchResponse,
  Prospect,
  ProspectsResponse,
  Question,
  Script,
  ScriptsResponse,
  OrphansResponse,
  OrphanRepairResult,
} from "../../shared/schemas";
import type { DashboardPeriod, Source, Status } from "../../shared/constants";

export type ProspectFilters = {
  status?: Status;
  /** The literal "none" means unassigned, which the API expresses as a filter absence. */
  assignedTo?: string;
  source?: Source;
};

/** One factory, so an invalidation can never miss a key by spelling it differently. */
export const adminKeys = {
  /** Every period's entry at once — what a mutation invalidates (query-client.ts). */
  dashboards: () => ["admin", "dashboard"] as const,
  dashboard: (period: DashboardPeriod) => ["admin", "dashboard", period] as const,
  prospects: (filters: ProspectFilters) => ["admin", "prospects", filters] as const,
  agents: () => ["admin", "agents"] as const,
  duplicates: () => ["admin", "duplicates"] as const,
  visitsFeed: () => ["admin", "visits", "feed"] as const,
  scripts: () => ["admin", "scripts"] as const,
  orphans: () => ["admin", "visits", "orphans"] as const,
};

/**
 * Tableau de bord's figures for one period (GH #107).
 *
 * No polling in this story. `keepPreviousData` keeps the last period's cards on
 * screen while another period loads, instead of flashing back to skeletons.
 * Every mutation marks it stale (query-client.ts), so it refetches as soon as
 * it is on screen, whatever staleTime a later story sets.
 */
export function useDashboard(period: DashboardPeriod) {
  return useQuery({
    queryKey: adminKeys.dashboard(period),
    queryFn: () => apiFetch<DashboardResponse>(`/api/admin/dashboard?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

function toQueryString(filters: ProspectFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
  if (filters.source) params.set("source", filters.source);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function useProspects(filters: ProspectFilters) {
  return useQuery({
    queryKey: adminKeys.prospects(filters),
    queryFn: () => apiFetch<ProspectsResponse>(`/api/admin/prospects${toQueryString(filters)}`),
  });
}

export function useAgents() {
  return useQuery({
    queryKey: adminKeys.agents(),
    queryFn: () => apiFetch<AgentsResponse>("/api/admin/agents"),
    // The roster comes from a Worker variable, not a table. It cannot change
    // while the page is open.
    staleTime: Infinity,
  });
}

function useInvalidateProspects() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["admin", "prospects"] });
}

export function useDuplicates() {
  return useQuery({
    queryKey: adminKeys.duplicates(),
    queryFn: () => apiFetch<DuplicatesResponse>("/api/admin/prospects/duplicates"),
    // A sweep compares thousands of rows; it is not something to redo on a whim.
    staleTime: 60_000,
  });
}

export function useMerge() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { survivorId: string; mergedId: string }) =>
      apiFetch<MergeResult>("/api/admin/prospects/merge", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      // Both: one prospect left the list, and this pair left the sweep.
      await client.invalidateQueries({ queryKey: ["admin", "prospects"] });
      await client.invalidateQueries({ queryKey: adminKeys.duplicates() });
    },
  });
}

export function useAssign() {
  const invalidate = useInvalidateProspects();
  return useMutation({
    mutationFn: (input: { ids: string[]; assignedTo: string | null }) =>
      apiFetch<AssignResult>("/api/admin/prospects/assign", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/**
 * Send an import one request at a time.
 *
 * Not a plain mutation: a file is many requests (250 rows each, the Worker's
 * cap), they have to go in order, and the admin needs to see how far it got if
 * one fails. Resending the whole file afterwards is safe — the upsert is keyed
 * on the dedupe key — which is what the failure copy tells them.
 */
export function useImportBatches(source: Source = "csv") {
  const client = useQueryClient();
  const invalidate = useInvalidateProspects();
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function start(rows: ImportRow[]) {
    setIsRunning(true);
    setError(null);
    setResult(null);

    const batches = batched(rows, IMPORT_ROWS_PER_REQUEST);
    const totals = { created: 0, updated: 0 };
    let done = 0;
    setProgress({ done: 0, total: rows.length });

    try {
      for (const batch of batches) {
        const outcome = await apiFetch<ImportResult>("/api/admin/prospects/batch", {
          method: "POST",
          body: JSON.stringify({ source, rows: batch }),
        });
        totals.created += outcome.created;
        totals.updated += outcome.updated;
        done += batch.length;
        setProgress({ done, total: rows.length });
      }
      setResult(totals);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : copy.import.failed);
    } finally {
      setIsRunning(false);
      // Not a useMutation, so the MutationCache in query-client.ts never sees
      // it: an import adds open prospects, so the dashboard is stale too.
      await Promise.all([
        invalidate(),
        client.invalidateQueries({ queryKey: adminKeys.dashboards() }),
      ]);
    }
  }

  function reset() {
    setProgress({ done: 0, total: 0 });
    setResult(null);
    setError(null);
  }

  return { start, reset, progress, result, error, isRunning };
}

/**
 * Search an area for places — ADR-0008.
 *
 * A mutation rather than a query: it is an action the admin takes by pressing a
 * button, not state the screen reads. That also means no automatic retry — the
 * screen offers the admin one, because Overpass is a shared public service and
 * a client that retries on its own is how an app gets rate-limited.
 */
export function useOverpassImport() {
  return useMutation({
    mutationFn: (polygon: [number, number][]) =>
      apiFetch<AreaSearchResponse>("/api/admin/import/overpass", {
        method: "POST",
        body: JSON.stringify({ polygon }),
      }),
    retry: false,
  });
}

/**
 * Search a circle for places — ADR-0020.
 *
 * The same mutation-not-query reasoning as above, with one more: a search here
 * is billable, so it must never happen because a component remounted or a
 * window regained focus. `retry: false` matters twice over — an automatic
 * retry would be a second charge for the same failure.
 */
export function usePlacesImport() {
  return useMutation({
    mutationFn: (circle: { center: [number, number]; radius: number }) =>
      apiFetch<AreaSearchResponse>("/api/admin/import/places", {
        method: "POST",
        body: JSON.stringify(circle),
      }),
    retry: false,
  });
}

/** How often the feed asks, while the tab is visible (ADR-0010). */
const FEED_POLL_MS = 15_000;

/**
 * Visits as they arrive — ADR-0010.
 *
 * The cursor lives in a ref, not in the query key. Putting a moving `since` in
 * the key would mint a fresh cache entry every 15 s and grow without bound; a
 * stable key means one entry that is refetched, which is what TanStack's
 * interval is for.
 *
 * `refetchIntervalInBackground` stays at its default of false, which is what
 * pauses the poll on a hidden tab. `refetchOnWindowFocus` is overridden to
 * true: AdminApp turns it off globally, and coming back to the tab is exactly
 * when the feed should catch up rather than wait out the interval.
 */
export function useVisitsFeed() {
  const since = useRef(0);
  /**
   * Whether a first answer has landed. Without this the opening page arrives
   * all at once and every row highlights — the screen announces eighteen new
   * visits when nothing is new, which is precisely the noise the ambient rule
   * exists to avoid. A visit arriving into an empty feed while it is open is
   * still new; a feed being filled for the first time is not.
   */
  const seeded = useRef(false);
  /** The list as the effect last folded it, so the fold never reads stale state. */
  const held = useRef<AdminVisit[]>([]);
  const [visits, setVisits] = useState<AdminVisit[]>([]);
  const [arrived, setArrived] = useState<string[]>([]);

  const query = useQuery({
    queryKey: adminKeys.visitsFeed(),
    queryFn: () => apiFetch<AdminVisitsResponse>(`/api/admin/visits?since=${since.current}`),
    refetchInterval: FEED_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const page = query.data;
  useEffect(() => {
    if (!page) return;

    /**
     * Folded here rather than inside a `setVisits` updater, with the list
     * mirrored in a ref.
     *
     * An updater must be pure, and StrictMode double-invokes it in development
     * to prove it: doing this work in there ran the merge twice against the
     * same stale list and marked the whole opening page as new. Running it in
     * the effect body is safe under the same double-invocation because
     * `mergeVisits` is idempotent — a second pass over the same answer is a
     * no-op, which `feed.test.ts` pins.
     */
    const merged = mergeVisits(held.current, page.visits);
    setArrived(seeded.current ? arrivedIds(held.current, page.visits) : []);
    held.current = merged;
    seeded.current = true;
    // Advance from what we actually hold, never from the server clock: a visit
    // written between the query and its answer is then delivered next poll
    // rather than skipped for good.
    since.current = nextSince(merged);
    setVisits(merged);
  }, [page]);

  return { visits, arrived, isPending: query.isPending, isError: query.isError };
}

export function usePatchProspect() {
  const invalidate = useInvalidateProspects();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<Prospect>) =>
      apiFetch<Prospect>(`/api/admin/prospects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: invalidate,
  });
}

/** Every version, newest first — docs/domains/scripts.md. At most one `isActive`. */
export function useScripts() {
  return useQuery({
    queryKey: adminKeys.scripts(),
    queryFn: () => apiFetch<ScriptsResponse>("/api/admin/scripts"),
  });
}

/**
 * Saving a script is never an edit — it writes version N+1 of that name and
 * activates it (docs/domains/scripts.md). The screen's confirmation dialog is
 * what makes that unmistakable before this fires.
 */
export function useCreateScript() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; questions: Question[] }) =>
      apiFetch<Script>("/api/admin/scripts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.scripts() }),
  });
}

/**
 * The repair queue (ADR-0022).
 *
 * No polling, unlike the live feed: a visit lands here when a sync fails to
 * place it, which is rare and is not something the admin sits watching. It is
 * refetched when the tab regains focus and after every repair or discard.
 */
export function useOrphans() {
  return useQuery({
    queryKey: adminKeys.orphans(),
    queryFn: () => apiFetch<OrphansResponse>("/api/admin/visits/orphaned"),
    refetchOnWindowFocus: true,
  });
}

/** Invalidates the queue and the prospect list — a repair moves a status. */
function useInvalidateAfterRepair() {
  const client = useQueryClient();
  return async () => {
    await client.invalidateQueries({ queryKey: adminKeys.orphans() });
    await client.invalidateQueries({ queryKey: ["admin", "prospects"] });
  };
}

export function useRepairOrphan() {
  const invalidate = useInvalidateAfterRepair();
  return useMutation({
    mutationFn: (input: { visitId: string; prospectId: string }) =>
      apiFetch<OrphanRepairResult>(`/api/admin/visits/orphaned/${input.visitId}/repair`, {
        method: "POST",
        body: JSON.stringify({ prospectId: input.prospectId }),
      }),
    onSuccess: invalidate,
  });
}

export function useDiscardOrphan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (visitId: string) =>
      apiFetch<{ discarded: string }>(`/api/admin/visits/orphaned/${visitId}/discard`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    // Only the queue: a discarded visit never counted, so no status moved.
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.orphans() }),
  });
}

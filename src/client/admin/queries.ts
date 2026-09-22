/**
 * Admin data access. TanStack Query lives on this side only (ADR-0013): the
 * field client's source of truth is Dexie, and a second cache over the outbox
 * is how visits get lost.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "../api";
import { copy } from "../copy";
import { IMPORT_ROWS_PER_REQUEST } from "../../shared/constants";
import { batched } from "./import/csv";
import type {
  AgentsResponse,
  AssignResult,
  DuplicatesResponse,
  ImportResult,
  ImportRow,
  MergeResult,
  Prospect,
  ProspectsResponse,
  Question,
  Script,
  ScriptsResponse,
} from "../../shared/schemas";
import type { Source, Status } from "../../shared/constants";

export type ProspectFilters = {
  status?: Status;
  /** The literal "none" means unassigned, which the API expresses as a filter absence. */
  assignedTo?: string;
  source?: Source;
};

/** One factory, so an invalidation can never miss a key by spelling it differently. */
export const adminKeys = {
  prospects: (filters: ProspectFilters) => ["admin", "prospects", filters] as const,
  agents: () => ["admin", "agents"] as const,
  duplicates: () => ["admin", "duplicates"] as const,
  scripts: () => ["admin", "scripts"] as const,
};

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
export function useImportBatches() {
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
          body: JSON.stringify({ source: "csv", rows: batch }),
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
      await invalidate();
    }
  }

  function reset() {
    setProgress({ done: 0, total: 0 });
    setResult(null);
    setError(null);
  }

  return { start, reset, progress, result, error, isRunning };
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

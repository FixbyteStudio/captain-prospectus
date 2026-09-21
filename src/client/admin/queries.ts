/**
 * Admin data access. TanStack Query lives on this side only (ADR-0013): the
 * field client's source of truth is Dexie, and a second cache over the outbox
 * is how visits get lost.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import type {
  AgentsResponse,
  AssignResult,
  Prospect,
  ProspectsResponse,
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

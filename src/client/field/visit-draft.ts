/**
 * The visit form's state and its rules — docs/domains/field-operations.md.
 *
 * Validation runs against `visitSchema` from src/shared, which is the same
 * object the Worker validates the payload with. That is the point: a form with
 * its own copy of the rules is a form that can disagree with the server about
 * whether a visit is savable, and on this side a disagreement loses a visit.
 * There is no form library here — ADR-0015.
 */
import { visitSchema, type Visit } from "../../shared/schemas";
import type { Outcome } from "../../shared/constants";
import type { Point } from "../../shared/geo";

export type VisitDraft = {
  flyerGiven: boolean;
  outcome: Outcome | null;
  /** The raw "YYYY-MM-DD" from `<input type="date">`, or "" when untouched. */
  followUpDate: string;
  notes: string;
};

export const emptyDraft: VisitDraft = {
  flyerGiven: false,
  outcome: null,
  followUpDate: "",
  notes: "",
};

/** Which control to mark, so an error lands on the thing that caused it. */
export type DraftErrorField = "outcome" | "followUpDate" | "notes";

export type DraftResult =
  { ok: true; visit: Visit } | { ok: false; errors: Partial<Record<DraftErrorField, true>> };

/**
 * `<input type="date">` yields a calendar date with no time and no zone. Read
 * with `new Date("2026-09-29")` the browser parses it as **UTC midnight**, so
 * an agent in Paris picking the 29th stores a moment that is the 29th at 02:00
 * local — harmless — while an agent west of Greenwich would store the 28th.
 *
 * Constructing from the parts instead gives local midnight on the day the agent
 * actually tapped, everywhere.
 */
export function dateInputToEpochMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  const date = new Date(year, month - 1, day);
  // Rejects the 31st of a 30-day month, which the regex alone would accept.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

/** The inverse, for showing a stored follow-up back in the input. */
export function epochMsToDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Turn a draft into a visit, or say which controls are wrong.
 *
 * `id` and `visitedAt` are passed in rather than generated here so the caller
 * owns them: the id must be stable across re-validation (INVARIANT 4) and the
 * timestamp is the moment the agent saved, not the moment the form validated.
 */
export function toVisit(
  draft: VisitDraft,
  context: { id: string; prospectId: string; visitedAt: number; position: Point | null },
): DraftResult {
  const errors: Partial<Record<DraftErrorField, true>> = {};

  if (!draft.outcome) errors.outcome = true;

  const followUpAt = draft.followUpDate ? dateInputToEpochMs(draft.followUpDate) : null;
  if (draft.followUpDate && followUpAt === null) errors.followUpDate = true;

  // field-operations.md: required when the outcome is follow_up. visitSchema
  // refines this too; checking here is what lets the error point at the field.
  if (draft.outcome === "follow_up" && followUpAt === null) errors.followUpDate = true;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const candidate = {
    id: context.id,
    prospectId: context.prospectId,
    visitedAt: context.visitedAt,
    lat: context.position?.lat ?? null,
    lng: context.position?.lng ?? null,
    flyerGiven: draft.flyerGiven,
    outcome: draft.outcome,
    followUpAt,
    notes: draft.notes.trim() || null,
    // Script questions arrive in M3. The visit records that it answered none,
    // rather than pretending a script it never saw.
    scriptId: null,
    answers: {},
  };

  const parsed = visitSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, visit: parsed.data };

  // The shared schema refused something the checks above did not catch — a
  // note past 2000 characters, most likely. Map it back to a control rather
  // than showing a zod message, which would be English and mention a path.
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "notes") errors.notes = true;
    else if (field === "followUpAt") errors.followUpDate = true;
    else errors.outcome = true;
  }
  return { ok: false, errors };
}

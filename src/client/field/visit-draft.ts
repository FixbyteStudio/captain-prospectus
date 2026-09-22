/**
 * The visit form's state and its rules — docs/domains/field-operations.md.
 *
 * Validation runs against `visitSchema` from src/shared, which is the same
 * object the Worker validates the payload with. That is the point: a form with
 * its own copy of the rules is a form that can disagree with the server about
 * whether a visit is savable, and on this side a disagreement loses a visit.
 * There is no form library here — ADR-0015.
 */
import { answersSchemaFor } from "../../shared/answers";
import { visitSchema, type Answers, type Script, type Visit } from "../../shared/schemas";
import type { Outcome } from "../../shared/constants";
import type { Point } from "../../shared/geo";

export type VisitDraft = {
  flyerGiven: boolean;
  outcome: Outcome | null;
  /** The raw "YYYY-MM-DD" from `<input type="date">`, or "" when untouched. */
  followUpDate: string;
  notes: string;
  /** Keyed by question `key`; only the questions this build can ask. */
  answers: Answers;
};

export const emptyDraft: VisitDraft = {
  flyerGiven: false,
  outcome: null,
  followUpDate: "",
  notes: "",
  answers: {},
};

/**
 * Which control to mark and why — so an error lands on the thing that caused
 * it, saying what is actually wrong with it.
 *
 * A follow-up date has two distinct failures with two distinct lines in
 * `copy.visit` — "you have not given one" and "the day you typed does not
 * exist" — and telling an agent the date is missing when it is there, but
 * impossible, is the kind of message that gets a form abandoned outdoors.
 */
export type DraftErrors = {
  outcome?: "required";
  followUpDate?: "required" | "invalid";
  notes?: "tooLong";
  /** Per question `key`, so each control is marked on its own. */
  answers?: Record<string, "required" | "invalid">;
};

export type DraftResult = { ok: true; visit: Visit } | { ok: false; errors: DraftErrors };

/**
 * Change the outcome, dropping a follow-up date the new outcome does not use.
 *
 * The date input is rendered only for `follow_up`, so leaving `followUpDate`
 * behind would send a date the agent cancelled and can no longer see — and
 * `POST /api/agent/sync` writes `followUpAt` into `prospects.next_visit_at`
 * whatever the outcome is, which would park the prospect under « Plus tard »
 * on a day nobody chose. It would also let validation fail on an unmounted
 * control, leaving the save button doing nothing with no error in view.
 */
export function withOutcome(draft: VisitDraft, outcome: Outcome): VisitDraft {
  if (outcome === "follow_up") return { ...draft, outcome };
  return { ...draft, outcome, followUpDate: "" };
}

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
  context: {
    id: string;
    prospectId: string;
    visitedAt: number;
    position: Point | null;
    /**
     * The script as it stood when the form opened, pinned by the caller.
     * scripts.md: a visit records the version it was answered with, even if a
     * newer one arrived before it synced. Null when none was cached.
     */
    script?: Script | null;
  },
): DraftResult {
  const errors: DraftErrors = {};

  if (!draft.outcome) errors.outcome = "required";

  const followUpAt = draft.followUpDate ? dateInputToEpochMs(draft.followUpDate) : null;
  if (draft.followUpDate && followUpAt === null) errors.followUpDate = "invalid";

  // field-operations.md: required when the outcome is follow_up. visitSchema
  // refines this too; checking here is what lets the error point at the field.
  if (draft.outcome === "follow_up" && followUpAt === null) {
    errors.followUpDate = draft.followUpDate ? "invalid" : "required";
  }

  // field-operations.md: required questions must be answered unless the outcome
  // is `no_contact` — nobody was there to ask. A wrong answer is still wrong.
  const script = context.script ?? null;
  if (script) {
    const answers = answersSchemaFor(script.questions, {
      enforceRequired: draft.outcome !== "no_contact",
    }).safeParse(draft.answers);

    if (!answers.success) {
      const byKey: Record<string, "required" | "invalid"> = {};
      for (const issue of answers.error.issues) {
        const key = issue.path[0];
        if (typeof key !== "string") continue;
        // An absent value is the agent not answering; anything else is an
        // answer that is wrong, and those read very differently on a pavement.
        byKey[key] = draft.answers[key] === undefined ? "required" : "invalid";
      }
      errors.answers = byKey;
    }
  }

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
    // The version the agent actually answered, not whichever is active now.
    scriptId: script?.id ?? null,
    answers: script ? draft.answers : {},
  };

  const parsed = visitSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, visit: parsed.data };

  // The shared schema refused something the checks above did not catch — a
  // note past 2000 characters, most likely. Map it back to a control rather
  // than showing a zod message, which would be English and mention a path.
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "notes") errors.notes = "tooLong";
    else if (field === "followUpAt") errors.followUpDate = "required";
    else if (field === "answers") {
      const key = issue.path[1];
      if (typeof key === "string") errors.answers = { ...errors.answers, [key]: "invalid" };
    } else errors.outcome = "required";
  }
  return { ok: false, errors };
}

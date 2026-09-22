/**
 * What counts as a valid answer to a script question — docs/domains/scripts.md.
 *
 * One definition, used by the field visit form as its react-hook-form resolver
 * (ADR-0018) and available to the Worker for reading answers back. The question
 * types and their answer values are the table in scripts.md; this file is that
 * table as code, and the two must not drift.
 *
 * Pure module: no DOM, no Worker APIs (CLAUDE.md).
 */
import * as z from "zod/mini";
import { QUESTION_TYPES } from "./constants";
import type { Question } from "./schemas";

/** Same cap as `longText` in schemas.ts, which `answersSchema` also applies. */
const MAX_TEXT = 2000;
const MAX_OPTIONS = 30;

const KNOWN_TYPES: ReadonlySet<string> = new Set(QUESTION_TYPES);

/**
 * Can this build ask this question?
 *
 * A script is **data, not contract shape**. `clientVersion` and INVARIANT 9
 * govern the sync payload, not the questionnaire travelling inside it, so an
 * admin on a newer build can save a question type an agent's phone has never
 * heard of and that phone will pull it on the next sync. Throwing there would
 * take down the visit form — the one screen the whole app exists for — and an
 * agent who cannot open it loses the visit (INVARIANT 5).
 *
 * So a question this build cannot ask is skipped, never fatal. The schema and
 * the screen both ask this, so a question that is not validated is also never
 * rendered: the agent answers what their build understands, the visit saves,
 * and the answers it does hold are still true.
 */
export function isAnswerable(question: Question): boolean {
  if (!KNOWN_TYPES.has(question.type)) return false;
  // A choice with nothing to choose from cannot be answered, and a required one
  // would block the save with no way on earth to satisfy it. The server refuses
  // to store such a question (`questionSchema`), so this is belt and braces —
  // but the belt is what an agent standing at a door depends on.
  if (question.type === "single" || question.type === "multi") {
    return (question.options?.length ?? 0) > 0;
  }
  return true;
}

/** The questions this build can actually put on screen, in script order. */
export function answerableQuestions(questions: readonly Question[]): Question[] {
  return questions.filter(isAnswerable);
}

function answerSchemaFor(question: Question, mustAnswer: boolean) {
  const options = question.options ?? [];
  switch (question.type) {
    case "yes_no":
      return z.boolean();
    case "single":
      return z.enum(options);
    case "multi": {
      const chosen = z.array(z.enum(options)).check(z.maxLength(MAX_OPTIONS));
      return mustAnswer ? chosen.check(z.minLength(1)) : chosen;
    }
    case "text": {
      const text = z.string().check(z.trim(), z.maxLength(MAX_TEXT));
      return mustAnswer ? text.check(z.minLength(1)) : text;
    }
    case "number":
      return z.number();
    case "rating":
      // scripts.md: integer 1–5.
      return z.int().check(z.gte(1), z.lte(5));
    default:
      // Unreachable: `answerableQuestions` filtered this out. Returning rather
      // than throwing keeps that true even if the filter is ever loosened.
      return z.unknown();
  }
}

/**
 * A schema over the whole script's answers, keyed by question `key`.
 *
 * `enforceRequired` is false when the outcome is `no_contact`: nobody was
 * there to ask, so required questions are not required (field-operations.md).
 * A wrong answer is still wrong either way — relaxing "required" never relaxes
 * "valid".
 */
export function answersSchemaFor(
  questions: readonly Question[],
  { enforceRequired }: { enforceRequired: boolean },
) {
  const shape: Record<string, z.ZodMiniType> = {};
  for (const question of answerableQuestions(questions)) {
    const mustAnswer = enforceRequired && question.required === true;
    const schema = answerSchemaFor(question, mustAnswer);
    shape[question.key] = mustAnswer ? schema : z.optional(schema);
  }
  return z.object(shape);
}

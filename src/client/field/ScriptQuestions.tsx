/**
 * The active script's questions, on step 2 of the visit form — docs/design.md
 * ("The script is the second screen"), docs/domains/scripts.md.
 *
 * One control per question type, all built from `field-controls.tsx` so no new
 * Radix reaches the field chunk (ADR-0015). The type → control mapping is the
 * visible half of the type → answer table in scripts.md; `src/shared/answers.ts`
 * is the half that validates, and the two are read together.
 *
 * Every question is addressable as `question-<key>` so a blocked save can scroll
 * the first bad answer into view: with a variable number of questions the
 * offending one is easily below the fold, and a save button that appears to do
 * nothing is how a form gets abandoned on a pavement.
 */
import { FieldCheckbox, FieldRadioGroup, FieldRadioOption } from "@/ui/field-controls";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { copy } from "../copy";
import type { Answers, Question } from "../../shared/schemas";

/** scripts.md: rating is an integer 1–5. */
const RATINGS = [1, 2, 3, 4, 5] as const;

export const questionDomId = (key: string) => `question-${key}`;

type AnswerValue = Answers[string];

function QuestionControl({
  question,
  value,
  invalid,
  onChange,
}: {
  question: Question;
  value: AnswerValue | undefined;
  invalid: boolean;
  onChange: (value: AnswerValue | undefined) => void;
}) {
  const id = questionDomId(question.key);

  switch (question.type) {
    case "yes_no":
      return (
        <FieldRadioGroup label={question.label} invalid={invalid}>
          {[
            { value: "true", label: copy.visit.yes },
            { value: "false", label: copy.visit.no },
          ].map((option, index) => (
            <FieldRadioOption
              key={option.value}
              id={index === 0 ? id : undefined}
              name={question.key}
              value={option.value}
              checked={value === (option.value === "true")}
              onSelect={(next) => onChange(next === "true")}
            >
              {option.label}
            </FieldRadioOption>
          ))}
        </FieldRadioGroup>
      );

    case "single":
      return (
        <FieldRadioGroup label={question.label} invalid={invalid}>
          {(question.options ?? []).map((option, index) => (
            <FieldRadioOption
              key={option}
              id={index === 0 ? id : undefined}
              name={question.key}
              value={option}
              checked={value === option}
              onSelect={(next: string) => onChange(next)}
            >
              {option}
            </FieldRadioOption>
          ))}
        </FieldRadioGroup>
      );

    case "multi": {
      const chosen = Array.isArray(value) ? value : [];
      return (
        <div role="group" aria-label={question.label} className="grid gap-2">
          {(question.options ?? []).map((option, index) => (
            <FieldCheckbox
              key={option}
              id={index === 0 ? id : undefined}
              checked={chosen.includes(option)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...chosen, option] : chosen.filter((item) => item !== option))
              }
            >
              {option}
            </FieldCheckbox>
          ))}
        </div>
      );
    }

    case "text":
      return (
        <Textarea
          id={id}
          rows={2}
          className="text-base md:text-base"
          value={typeof value === "string" ? value : ""}
          aria-invalid={invalid ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "number":
      return (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          touch
          value={typeof value === "number" ? String(value) : ""}
          aria-invalid={invalid ? true : undefined}
          onChange={(event) => {
            // "" is the agent clearing the field, which is no answer at all —
            // not zero, which is an answer and a different thing.
            const raw = event.target.value;
            onChange(raw === "" ? undefined : Number(raw));
          }}
        />
      );

    case "rating":
      return (
        <FieldRadioGroup label={question.label} invalid={invalid} className="grid-cols-5">
          {RATINGS.map((rating, index) => (
            <FieldRadioOption
              key={rating}
              id={index === 0 ? id : undefined}
              name={question.key}
              value={String(rating)}
              checked={value === rating}
              onSelect={(next) => onChange(Number(next))}
              className="justify-center"
            >
              {String(rating)}
            </FieldRadioOption>
          ))}
        </FieldRadioGroup>
      );

    default:
      // Unreachable: `answerableQuestions` filtered this out before we got here.
      return null;
  }
}

export function ScriptQuestions({
  questions,
  answers,
  errors,
  onChange,
}: {
  questions: readonly Question[];
  answers: Answers;
  errors: Record<string, "required" | "invalid"> | undefined;
  onChange: (answers: Answers) => void;
}) {
  return (
    <div className="grid gap-6">
      {questions.map((question) => {
        const error = errors?.[question.key];
        return (
          <div key={question.key}>
            <p className="text-base font-medium">{question.label}</p>
            <div className="mt-2">
              <QuestionControl
                question={question}
                value={answers[question.key]}
                invalid={error !== undefined}
                onChange={(value) => {
                  const next = { ...answers };
                  if (value === undefined) delete next[question.key];
                  else next[question.key] = value;
                  onChange(next);
                }}
              />
            </div>
            {error && (
              <p role="alert" className="text-destructive mt-1.5 text-sm">
                {error === "invalid" ? copy.visit.answerInvalid : copy.visit.answerRequired}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

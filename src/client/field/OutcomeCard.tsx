/**
 * One outcome, step 1 of the visit form — docs/design.md ("One decision per
 * screen"), invariant 3.
 *
 * A `<label>` over a native `<input type="radio">` (ADR-0015): the icon tile,
 * label and disc all share one neutral colour before selection, and gold
 * marks only which card is chosen — it is never a preview of the status
 * `OUTCOME_TO_STATUS` would derive from it. All five icons sit on the same
 * `bg-secondary` tile; only the checked one turns gold, through
 * `group-has-[:checked]`, which is selection, not an outcome colour.
 */
import { BadgeCheck, CheckIcon, Clock, DoorClosed, ThumbsDown, ThumbsUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { OUTCOME_HINTS, OUTCOME_LABELS } from "../copy";
import type { Outcome } from "../../shared/constants";

const OUTCOME_ICONS: Readonly<Record<Outcome, LucideIcon>> = {
  no_contact: DoorClosed,
  interested: ThumbsUp,
  not_interested: ThumbsDown,
  follow_up: Clock,
  converted: BadgeCheck,
};

/** Stable per outcome, so a blocked save can focus the first card by id. */
export const outcomeDomId = (outcome: Outcome) => `outcome-${outcome}`;

export function OutcomeCard({
  outcome,
  checked,
  onSelect,
}: {
  outcome: Outcome;
  checked: boolean;
  onSelect: (outcome: Outcome) => void;
}) {
  const Icon = OUTCOME_ICONS[outcome];
  const id = outcomeDomId(outcome);
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;

  return (
    <label
      className={cn(
        "group border-border bg-card flex min-h-decision cursor-pointer items-center gap-3 rounded-xl border px-4 py-3",
        "transition-colors select-none",
        "has-[:checked]:border-primary-edge has-[:checked]:ring-primary-edge has-[:checked]:bg-primary/12 has-[:checked]:ring-1 has-[:checked]:ring-inset",
        "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]",
      )}
    >
      <span
        aria-hidden
        className="bg-secondary group-has-[:checked]:bg-primary group-has-[:checked]:text-primary-foreground group-has-[:checked]:ring-primary-edge flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors group-has-[:checked]:ring-1 group-has-[:checked]:ring-inset"
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span id={labelId} className="text-heading block">
          {OUTCOME_LABELS[outcome]}
        </span>
        <span id={hintId} className="text-meta text-muted-foreground block">
          {OUTCOME_HINTS[outcome]}
        </span>
      </span>
      {/* The disc, with the check stacked over it the way FieldCheckbox does
          it — an input cannot have children, so the tick is a sibling.
          `aria-labelledby` names the input from the label span alone: without
          it, the implicit `<label>` wrap would fold the hint's text into the
          radio's *name*, and `aria-describedby` would read the same words a
          second time as its *description*. */}
      <span className="relative inline-flex size-6 shrink-0 items-center justify-center">
        <input
          id={id}
          type="radio"
          name="outcome"
          value={outcome}
          checked={checked}
          onChange={() => onSelect(outcome)}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          className={cn(
            "peer border-input absolute inset-0 appearance-none rounded-full border shadow-xs",
            "checked:border-primary-edge checked:bg-primary transition-colors",
            "focus-visible:outline-none",
          )}
        />
        <span className="text-primary-foreground pointer-events-none relative opacity-0 peer-checked:opacity-100">
          <CheckIcon aria-hidden className="size-4" />
        </span>
      </span>
    </label>
  );
}

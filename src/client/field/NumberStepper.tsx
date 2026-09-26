/**
 * The number question's control, step 2 of the visit form — DESIGN.md ›
 * Choice controls (field): "− / +" at 48px around a typeable value in display
 * weight, never below 0.
 *
 * Built on the vendored `Button` classes and `Input`, not a new component:
 * ADR-0014 asks for shadcn elements, and a stepper is a button pair plus a
 * text field, not a control shadcn ships whole.
 */
import { MinusIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/ui/button-variants";
import { Input } from "@/ui/input";
import { copy } from "../copy";

export function NumberStepper({
  id,
  value,
  invalid,
  label,
  onChange,
}: {
  id: string;
  value: number | undefined;
  invalid: boolean;
  label: string;
  onChange: (value: number | undefined) => void;
}) {
  // The floor: disabled once there is nothing to go lower from, or nowhere
  // lower to go — never negative (docs/design.md, Choice controls).
  const canStepDown = value !== undefined && value > 0;

  return (
    // The group names the question, so two number questions never read as
    // two identical « Diminuer » / « Augmenter » pairs.
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <button
        type="button"
        aria-label={copy.visit.stepDown}
        disabled={!canStepDown}
        className={buttonVariants({ variant: "secondary", size: "icon-touch" })}
        onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}
      >
        <MinusIcon aria-hidden />
      </button>
      <Input
        id={id}
        type="number"
        min={0}
        inputMode="decimal"
        touch
        aria-label={label}
        aria-invalid={invalid ? true : undefined}
        // `!`: `text-display` is a theme token tailwind-merge does not know, so
        // Input's own `text-base` survives the merge and wins in CSS order.
        className="flex-1 text-center text-display! tabular-nums"
        value={value === undefined ? "" : String(value)}
        onChange={(event) => {
          // "" is the agent clearing the field, which is no answer at all —
          // not zero, which is an answer and a different thing.
          const raw = event.target.value;
          if (raw === "") {
            onChange(undefined);
            return;
          }
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) ? Math.max(0, parsed) : undefined);
        }}
      />
      <button
        type="button"
        aria-label={copy.visit.stepUp}
        className={buttonVariants({ variant: "secondary", size: "icon-touch" })}
        onClick={() => onChange((value ?? 0) + 1)}
      >
        <PlusIcon aria-hidden />
      </button>
    </div>
  );
}

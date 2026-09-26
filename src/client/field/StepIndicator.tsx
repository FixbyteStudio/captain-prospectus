/**
 * "Étape n sur 2 · <name>" — DESIGN.md › Step indicator, EXPERIENCE.md › Step
 * indicator (the redesign's own spec). `docs/design.md`, "The script is the
 * second screen" reverses this repo's earlier "no 1 sur 2, no dots" call to
 * match it. Renders on both steps, and only when the visit actually has one
 * (GH #123).
 */
import { copy } from "../copy";

export function StepIndicator({ step }: { step: 1 | 2 }) {
  // Step 1 is always Résultat, step 2 always Questions — the visit form has
  // no other shape (design.md, "The script is the second screen").
  const name = step === 1 ? copy.visit.outcome : copy.visit.questions;
  return (
    <p className="text-overline text-muted-foreground mt-3 flex items-center gap-1.5 uppercase">
      <span
        aria-hidden
        className="bg-primary ring-primary-edge size-1.5 shrink-0 rounded-full ring-1 ring-inset"
      />
      {copy.visit.step(step, 2, name)}
    </p>
  );
}

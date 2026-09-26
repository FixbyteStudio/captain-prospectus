/**
 * The field route's choice controls, built on native inputs — ADR-0015.
 *
 * Measured, which is what that ADR requires. Radix is 39.6 kB gzipped and the
 * field entry chunk had none of it before M2; pulling it in for a checkbox and
 * two radio groups put the route at 172 kB against a 150 kB budget.
 *
 * Unlike a dialog or a combobox, a radio group is **not** behaviour the
 * platform lacks. A native `<input type="radio">` group already gives arrow-key
 * navigation, roving focus, the right ARIA role and correct announcement, from
 * the browser, for nothing. Radix's value there is styling consistency, and
 * `appearance-none` buys that at zero bytes. So this is the same accessibility
 * at a fraction of the cost — not a trade of one for the other.
 *
 * The same reasoning does NOT extend to Dialog, Select or DropdownMenu, which
 * is why the admin side still uses Radix for all three.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

/** The tick. Inline rather than an icon import: it is nine bytes of path. */
function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A full-width checkbox row. The whole label is the target, so a thumb landing
 * anywhere on the line toggles it.
 */
export function FieldCheckbox({
  checked,
  onCheckedChange,
  children,
  hint,
  id,
  className,
  "aria-describedby": describedByProp,
  ...props
}: Omit<
  React.ComponentProps<"input">,
  "type" | "checked" | "onChange" | "children" | "onSelect"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
  /** A one-line description below the label — the Flyer remis card's hint. */
  hint?: React.ReactNode;
}) {
  const autoId = React.useId();
  // Only mint an id when something needs to reference it — an explicit `id`,
  // or the label/hint wiring below, which only exists when `hint` is set. A
  // plain checkbox with neither keeps rendering with no `id` at all, exactly
  // as it did before this prop existed.
  const needsId = id !== undefined || hint !== undefined;
  const inputId = needsId ? (id ?? autoId) : undefined;
  // `aria-labelledby`, not the implicit `<label>` wrap, once there's a hint:
  // otherwise the hint's own text folds into the input's *name*, and
  // `aria-describedby` reads the same words again as its *description*.
  const labelId = hint && inputId ? `${inputId}-label` : undefined;
  const hintId = hint && inputId ? `${inputId}-hint` : undefined;
  // A caller's own `aria-describedby` (ScriptQuestions' multi-choice items
  // pass none today, but the prop is still theirs to use) must not be
  // silently replaced by the hint's.
  const describedBy = [describedByProp, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <label
      className={cn(
        "flex min-h-touch cursor-pointer items-center gap-3 text-base select-none",
        className,
      )}
    >
      {/* An input cannot have children, so the tick is a sibling stacked over
          it. Both sit in one relative box so the label keeps normal spacing. */}
      <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          className={cn(
            "peer border-input absolute inset-0 appearance-none rounded-[4px] border shadow-xs",
            "checked:border-primary-edge checked:bg-primary transition-colors",
            "focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
          )}
          {...props}
        />
        <span className="text-primary-foreground pointer-events-none relative opacity-0 peer-checked:opacity-100">
          <CheckMark />
        </span>
      </span>
      <span>
        <span id={labelId} className="block">
          {children}
        </span>
        {hint && (
          <span id={hintId} className="text-meta text-muted-foreground mt-0.5 block">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * One option in a field radio group.
 *
 * `variant="row"` (the default) is 56px — the `--spacing-decision` token —
 * with a visible disc and a 12% gold wash, as Ajouter's type chips use it.
 * `variant="choice"` is DESIGN.md's Choice controls (field): a `bg-card`
 * tile with a border, no disc (the input is `sr-only`, so arrow keys and the
 * native radio semantics still work), and a full gold fill with navy text and
 * the `primary-edge` border when checked — `components.choice-selected` —
 * since the fill itself is what marks the pick.
 */
export function FieldRadioOption({
  name,
  value,
  checked,
  onSelect,
  children,
  className,
  variant = "row",
  ...props
}: Omit<
  React.ComponentProps<"input">,
  "type" | "checked" | "onChange" | "children" | "onSelect"
> & {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  children: React.ReactNode;
  variant?: "row" | "choice";
}) {
  return (
    <label
      className={cn(
        "border-border flex cursor-pointer items-center gap-3 rounded-md border px-4 text-base",
        "transition-colors select-none",
        "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]",
        variant === "row" &&
          "min-h-decision has-[:checked]:border-primary-edge has-[:checked]:bg-primary/12",
        variant === "choice" &&
          "bg-card min-h-touch has-[:checked]:border-primary-edge has-[:checked]:bg-primary has-[:checked]:text-primary-foreground",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className={cn(
          variant === "row" &&
            "border-input size-5 shrink-0 appearance-none rounded-full border shadow-xs checked:border-primary-edge checked:border-[6px] transition-colors focus-visible:outline-none",
          variant === "choice" && "sr-only",
        )}
        {...props}
      />
      <span className="font-medium">{children}</span>
    </label>
  );
}

/**
 * The group wrapper. A `radiogroup` role plus a label is what makes the set
 * announce as one control; the arrow-key behaviour comes from the browser.
 */
export function FieldRadioGroup({
  label,
  invalid,
  children,
  className,
  "aria-describedby": describedBy,
}: {
  label: string;
  invalid?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Ties the group to its own error line, so focus and message read as one. */
  "aria-describedby"?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      className={cn("grid gap-2", className)}
    >
      {children}
    </div>
  );
}

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
  className,
  ...props
}: Omit<
  React.ComponentProps<"input">,
  "type" | "checked" | "onChange" | "children" | "onSelect"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
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
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
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
      <span>{children}</span>
    </label>
  );
}

/**
 * One option in a field radio group. 56px — the `--spacing-decision` token —
 * because the visit outcome has to be hittable without looking carefully
 * (docs/design.md, "One decision per screen").
 */
export function FieldRadioOption({
  name,
  value,
  checked,
  onSelect,
  children,
  className,
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
}) {
  return (
    <label
      className={cn(
        "border-border flex min-h-decision cursor-pointer items-center gap-3 rounded-md border px-4 text-base",
        "transition-colors select-none",
        "has-[:checked]:border-primary-edge has-[:checked]:bg-primary/12",
        "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]",
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
          "border-input size-5 shrink-0 appearance-none rounded-full border shadow-xs",
          "checked:border-primary-edge checked:border-[6px] transition-colors",
          "focus-visible:outline-none",
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
}: {
  label: string;
  invalid?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      className={cn("grid gap-2", className)}
    >
      {children}
    </div>
  );
}

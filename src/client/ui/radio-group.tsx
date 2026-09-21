import * as React from "react";
import { cn } from "@/lib/utils";
import { CircleIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };

/**
 * A full-width field target: the label *is* the tap area, with the radio as its
 * indicator. Composed here rather than in a screen so the 56px size lives in
 * the vendored component (ADR-0014 decision 5).
 *
 * Used for the visit outcome and the prospect type — the two places where a
 * field screen asks a one-tap question (design.md, "One decision per screen").
 */
function RadioGroupOption({
  value,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof RadioGroupPrimitive.Item>, "children"> & {
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-decision cursor-pointer items-center gap-3 rounded-md border border-border px-4 text-base",
        "transition-colors has-[[data-state=checked]]:border-primary-edge has-[[data-state=checked]]:bg-primary/12",
        "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        className,
      )}
    >
      <RadioGroupItem value={value} className="size-5" {...props} />
      <span className="font-medium">{children}</span>
    </label>
  );
}

export { RadioGroupOption };

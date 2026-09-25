/**
 * The button's classes, split from the component on purpose.
 *
 * `button.tsx` imports Radix's Slot for `asChild`, and Slot plus compose-refs
 * is ~7 kB raw in whatever chunk touches it. The field screens style links as
 * buttons and never need `asChild`, so they import from here and leave Slot in
 * the admin chunk (ADR-0015 — the rule is that the cheap thing cites a
 * measurement, and this is one).
 */
import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The border is ours, not shadcn's. The brand gold is only ~2.2:1
        // against the page, so without its own edge the primary button has no
        // discernible boundary (WCAG 1.4.11). The darker gold gives 3.4:1.
        default:
          "bg-primary text-primary-foreground border-primary-edge border hover:bg-primary/90",
        // text-destructive-foreground at full opacity: palette.test.ts asserts
        // ink-on-destructive at AA, and dark:bg-destructive/60 rendered a
        // different, untested pair — see badge.tsx's destructive variant.
        // hover:bg-destructive/90 stays: it renders only while the pointer is
        // over the button, not the resting fill the contrast pair asserts, so
        // dimming it there does not make that proof vacuous the way dimming
        // the resting fill did.
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        // Not text-primary: the brand gold is 2.4:1 on a light surface.
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
        /**
         * Field screens. 48px is the minimum target ADR-0014 decision 5
         * asks for, and text-base keeps it legible at arm's length in
         * sunlight. It lives here rather than being re-declared per
         * screen, which is the point of that decision.
         */
        touch: "h-touch rounded-md px-5 text-base has-[>svg]:px-4",
        "icon-touch": "size-touch [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

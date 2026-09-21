import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges conditional class lists and resolves conflicting Tailwind utilities.
 *  Every vendored shadcn component expects this name at this path. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

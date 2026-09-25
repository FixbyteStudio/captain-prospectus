/**
 * « Retour à la tournée ».
 *
 * Lucide, not a hand-rolled path: the field entry chunk already carries it
 * for `App.tsx`'s empty-state icons and `SyncIndicator.tsx`'s sync icons, so
 * there is no per-icon budget left to save here (ADR-0026 budgets the field
 * route by its precache total, not by counting icons into the entry chunk).
 */
import { ArrowLeftIcon } from "lucide-react";
import { Link } from "react-router";
import { copy } from "../copy";

export function BackLink() {
  return (
    <Link
      to="/tournee"
      className="text-muted-foreground hover:text-foreground inline-flex min-h-touch items-center gap-2 text-sm"
    >
      <ArrowLeftIcon aria-hidden className="size-4" />
      {copy.visit.back}
    </Link>
  );
}

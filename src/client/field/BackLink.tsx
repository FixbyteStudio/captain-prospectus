/**
 * « Retour à la tournée ».
 *
 * The arrow is an inline path rather than a lucide import: lucide costs 2.4 kB
 * gzipped in the field entry chunk and this is the only icon the field screens
 * use. ADR-0015's rule is that the cheap thing has to cite a measurement, and
 * that is this one. The admin side keeps lucide — it is a lazy chunk.
 */
import { Link } from "react-router";
import { copy } from "../copy";

export function BackLink() {
  return (
    <Link
      to="/tournee"
      className="text-muted-foreground hover:text-foreground inline-flex min-h-touch items-center gap-2 text-sm"
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none">
        <path
          d="M10 3.5L5.5 8l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {copy.visit.back}
    </Link>
  );
}

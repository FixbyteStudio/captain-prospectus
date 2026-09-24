/** Dates, numbers and distances, always fr-FR (ADR-0013). */

const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export function formatDateTime(epochMs: number): string {
  return dateTime.format(new Date(epochMs));
}

export function formatDate(epochMs: number): string {
  return date.format(new Date(epochMs));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

/** Only letters count, so a digit-only alias never survives into the
 * initial. `\p{L}` (not `a-zA-Z`) so an accented letter counts too. */
function letters(part: string): string {
  return part.replace(/[^\p{L}]/gu, "");
}

/**
 * The band avatar's label — spec-gh-65: the first letters of the first two
 * non-empty parts of the local part (split on `.`, `_`, `-`, `+`), else the
 * first two letters of the one part, uppercase, else "?". No name is stored
 * anywhere the client can read, so the email is all there is to initial.
 *
 * Parts are reduced to their letters *before* the empty ones are dropped, so
 * a leading separator or a numeric part (`_admin`, `1.john`) never counts as
 * a "part" on its own and never crowds out the name next to it.
 */
export function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local
    .split(/[._+-]/)
    .map(letters)
    .filter(Boolean);

  if (parts.length >= 2) {
    const [first, second] = parts as [string, string];
    return `${first[0]}${second[0]}`.toUpperCase();
  }

  const one = (parts[0] ?? "").slice(0, 2).toUpperCase();
  return one || "?";
}

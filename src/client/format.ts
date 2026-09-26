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

const count = new Intl.NumberFormat("fr-FR");
const tenth = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** A KPI figure: "1 284". */
export function formatCount(n: number): string {
  return count.format(n);
}

/** Up, down, or neither once rounded to the tenth of a percent shown. */
export type DeltaTone = "up" | "down" | "flat";

/** In tenths of a percent, so the tone and the figure round the same way. */
function tenths(delta: number): number {
  // Round the magnitude, so ±x land on the same figure (Math.round alone takes
  // halves toward +∞: −0.0005 would be flat while +0.0005 is up).
  const magnitude = Math.round(Math.abs(delta) * 1000);
  return delta < 0 ? -magnitude : magnitude;
}

/**
 * Which way a delta points. `null` (no previous period) and anything that
 * rounds to "0,0 %" are flat, so a green arrow never sits beside a zero.
 */
export function deltaTone(delta: number | null): DeltaTone {
  if (delta === null) return "flat";
  const t = tenths(delta);
  return t > 0 ? "up" : t < 0 ? "down" : "flat";
}

/**
 * A delta chip's figure — "+12,4 %", "−3,0 %", "0,0 %", or "—" when there is
 * no previous period to compare with (docs/api.md › The dashboard). The
 * minus is U+2212 and the space before % is non-breaking.
 */
export function formatDelta(delta: number | null): string {
  return signedTenths(delta, "%");
}

/**
 * Taux de conversion's delta chip, in percentage points: "+1,2 pt",
 * "−0,4 pt", "0,0 pt", or "—". A ratio of 0.012 is 1,2 points, so it rounds
 * and signs as `formatDelta` does, and `deltaTone` reads it unchanged.
 */
export function formatPoints(delta: number | null): string {
  return signedTenths(delta, "pt");
}

function signedTenths(delta: number | null, unit: string): string {
  if (delta === null) return "—";
  const t = tenths(delta);
  const sign = t > 0 ? "+" : t < 0 ? "\u2212" : "";
  return `${sign}${tenth.format(Math.abs(t) / 10)}\u00a0${unit}`;
}

/**
 * Taux de conversion's figure — "10,6 %", or "—" when nothing was visited
 * (docs/api.md › The dashboard). Rounds like `formatDelta`.
 */
export function formatPercent(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${tenth.format(tenths(ratio) / 10)}\u00a0%`;
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

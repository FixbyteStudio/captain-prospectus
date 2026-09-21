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

/**
 * The admin theme pin — GH #64. Pure and safe on purpose: `index.html`'s
 * pre-paint boot script duplicates the read below rather than importing it (a
 * module script is deferred past first paint, so a pinned-dark user would see
 * a white flash — see the spec's Design Notes), and `theme.test.ts` ties the
 * two `THEME_STORAGE_KEY` literals together the way `config.test.ts` ties the
 * reconnect marker to `vite.config.ts`.
 */

export const THEME_STORAGE_KEY = "cap-theme";

export type Theme = "light" | "dark";

/** Only "light" or "dark" is a pin; anything else — absent, or garbage like
 * "blue" — is none (I/O matrix, "Garbage stored"). */
export function parseTheme(raw: string | null): Theme | null {
  return raw === "light" || raw === "dark" ? raw : null;
}

export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

/**
 * The theme the page shows: `<html data-theme>` when it holds a pin, else the
 * system's. Read from the attribute rather than storage, so the button agrees
 * with the page even when storage is blocked and only the attribute changed.
 */
export function resolvedTheme(pinned: string | undefined, systemDark: boolean): Theme {
  return parseTheme(pinned ?? null) ?? (systemDark ? "dark" : "light");
}

/**
 * Wrapped in try/catch (Always list): a blocked or full `localStorage`
 * (private browsing, a locked-down device) must not break the toggle, only
 * its persistence (I/O matrix, "Storage blocked").
 */
export function writePin(theme: Theme): void {
  try {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Swallowed: the toggle still flips <html data-theme> for this page: the
    // caller writes that directly. Only the *next* load loses the pin and
    // falls back to the system theme.
  }
}

/**
 * The two writes a click must always make together (Always list: "A click
 * pins the other theme in localStorage and on <html data-theme>"). Takes
 * `root` rather than reaching for `document` itself so this stays pure and
 * testable against a stub — the caller passes `document.documentElement`.
 */
export function pinTheme(
  theme: Theme,
  root: { dataset: Record<string, string | undefined> },
): void {
  writePin(theme);
  root.dataset.theme = theme;
}

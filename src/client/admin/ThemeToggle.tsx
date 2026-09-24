import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { copy } from "../copy";
import { Button } from "../ui/button";
import { otherTheme, parseTheme, pinTheme, resolvedTheme, type Theme } from "../theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function currentTheme(): Theme {
  return resolvedTheme(
    document.documentElement.dataset.theme,
    window.matchMedia(DARK_QUERY).matches,
  );
}

/**
 * The Sun/Moon theme toggle (GH #64). `index.html`'s boot script already
 * applies a stored pin to `<html data-theme>` before this mounts, so this
 * component only *writes* that attribute on a click — the CSS in app.css
 * follows `prefers-color-scheme` on its own whenever nothing is pinned
 * (`@custom-variant dark`), which is what keeps the button and the page live
 * with the system when there is no pin (I/O matrix, "System flips").
 *
 * There is no route back to "system" once pinned (Always list): a click only
 * ever swaps to `otherTheme`.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      // A pin always wins; only an unpinned button follows the system live.
      if (parseTheme(document.documentElement.dataset.theme ?? null)) return;
      setTheme(event.matches ? "dark" : "light");
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const handleClick = () => {
    const next = otherTheme(theme);
    pinTheme(next, document.documentElement);
    setTheme(next);
  };

  const Icon = theme === "dark" ? SunIcon : MoonIcon;
  const label = theme === "dark" ? copy.theme.toLight : copy.theme.toDark;

  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} onClick={handleClick}>
      <Icon aria-hidden="true" />
    </Button>
  );
}

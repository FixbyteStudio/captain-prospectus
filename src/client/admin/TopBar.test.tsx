/**
 * The admin top bar's three live controls (GH #83).
 *
 * `nav.test.ts` and `theme.test.ts` cover `breadcrumbFor`, `isPaletteShortcut`
 * and `pinTheme` as pure functions, but nothing checked that the bar wires any
 * of them up: deleting `ThemeToggle`'s `onClick`, `SearchPalette`'s keydown
 * listener or `AccountMenu`'s `href` passed CI (GH #64 review deferral).
 *
 * `TopBar` is rendered directly rather than through `AdminApp`, whose
 * `AdminLayout` would pull in TanStack Query, sonner and the whole Sidebar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { copy } from "../copy";
import { THEME_STORAGE_KEY } from "../theme";
import { LOGOUT_PATH } from "./access-logout";
import { TopBar } from "./TopBar";

const EMAIL = "admin@example.com";

function renderTopBar(pathname = "/admin/prospects") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <TopBar pathname={pathname} email={EMAIL} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // A pin survives on <html> and in storage between tests otherwise, and the
  // toggle would start from the previous test's theme.
  delete document.documentElement.dataset.theme;
  localStorage.removeItem(THEME_STORAGE_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TopBar", () => {
  it("pins the other theme on <html> when the toggle is clicked", async () => {
    const user = userEvent.setup();
    // Nothing pinned and the system is light, so the button offers dark.
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList);
    renderTopBar();

    await user.click(screen.getByRole("button", { name: copy.theme.toDark }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    // The label names the action a click performs, so it swaps with the theme.
    expect(screen.getByRole("button", { name: copy.theme.toLight })).toBeTruthy();
  });

  it("opens the inert search palette on Ctrl+K, without a request", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderTopBar();

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("{Control>}k{/Control}");

    const dialog = await screen.findByRole("dialog");
    // The palette's whole content while search has no back end.
    expect(dialog.textContent).toContain(copy.search.unavailable);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("signs out through a plain anchor to Access, not a router link", async () => {
    const user = userEvent.setup();
    renderTopBar();

    await user.click(screen.getByRole("button", { name: copy.account.menu(EMAIL) }));

    // A router <Link> would be served the precached shell by the service
    // worker's navigateFallback and never reach Access (AccountMenu.tsx).
    const logout = await screen.findByRole("menuitem", { name: copy.account.logout });
    expect(logout.tagName).toBe("A");
    expect(logout.getAttribute("href")).toBe(LOGOUT_PATH);
  });
});

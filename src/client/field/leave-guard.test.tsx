/**
 * The context half of the leave guard (GH #83).
 *
 * `leave-guard.test.ts` covers `shouldAsk`, the pure rule. The plumbing around
 * it — `LeaveGuardProvider`, and `useRegisterDirty`'s two effects — was
 * reachable only through JSX and so untested, as the module's own header said
 * (GH #66 review deferral). Deleting either effect body left the guard
 * permanently clean and CI green; it does not any more.
 *
 * `VisitScreen` and `AddProspectScreen` are lazy, Dexie-backed and form-heavy,
 * so the contract is tested here against a minimal component and the two real
 * call sites are pinned by a source assertion at the bottom of this file.
 */
import { readFileSync } from "node:fs";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeaveGuardProvider, useLeaveGuard, useRegisterDirty } from "./leave-guard";

/** Reports what `FieldTabs` would read off the context on a tab tap. */
function GuardState() {
  return <p data-testid="dirty">{String(useLeaveGuard().dirty)}</p>;
}

/** The contract every field form signs: one `useRegisterDirty` call, fed by
 * `formState.isDirty`. */
function Form({ isDirty }: { isDirty: boolean }) {
  useRegisterDirty(isDirty);
  return null;
}

function Screen() {
  const [mounted, setMounted] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  return (
    <LeaveGuardProvider>
      {mounted && <Form isDirty={isDirty} />}
      <GuardState />
      <button type="button" onClick={() => setIsDirty(true)}>
        type-something
      </button>
      <button type="button" onClick={() => setMounted(false)}>
        leave-screen
      </button>
    </LeaveGuardProvider>
  );
}

const dirty = () => screen.getByTestId("dirty").textContent;

describe("useRegisterDirty", () => {
  it("starts clean and follows the form's own isDirty", async () => {
    const user = userEvent.setup();
    render(<Screen />);
    expect(dirty()).toBe("false");

    await user.click(screen.getByRole("button", { name: "type-something" }));
    expect(dirty()).toBe("true");
  });

  it("clears the flag when the form unmounts", async () => {
    const user = userEvent.setup();
    render(<Screen />);

    await user.click(screen.getByRole("button", { name: "type-something" }));
    expect(dirty()).toBe("true");

    // Leaving by any route — a confirmed tab tap, the back button, a save's
    // own navigate() — must not leave a stale "dirty" behind.
    await user.click(screen.getByRole("button", { name: "leave-screen" }));
    expect(dirty()).toBe("false");
  });

  // Not behavioural coverage — the two screens are lazy, Dexie-backed and
  // form-heavy, and mounting them to prove one hook call would be slow and
  // brittle. This is a reminder that the call site still exists at all, so
  // dropping the hook from a screen during the #67 sweep is noticed. Whether
  // it is called on the right value is what the cases above decide.
  it.each(["VisitScreen.tsx", "AddProspectScreen.tsx"])("still calls the hook in %s", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    // Whitespace-tolerant and blind to the variable's name: Prettier may
    // re-wrap the call and the sweep may rename `form`.
    expect(source).toMatch(/useRegisterDirty\(\s*\w+\.formState\.isDirty\s*\)/);
  });
});

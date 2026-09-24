import { useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";
import { copy } from "../copy";
import { Button } from "../ui/button";
import { CommandDialog, CommandEmpty, CommandInput, CommandList } from "../ui/command";
import { isPaletteShortcut, shortcutHint } from "./nav";

/**
 * The top bar's search button and its ⌘K palette (GH #64). Search itself is
 * not built yet — the dialog holds only its input and an explanatory empty
 * state, and makes no request (Never list). Two `Button`s rather than one
 * responsive one, so the 240px labelled button and the icon-only one below
 * 768px never fight over the same accessible name.
 */
export function SearchPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      setOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden w-60 justify-between font-normal md:inline-flex"
        onClick={() => setOpen(true)}
      >
        <span className="text-muted-foreground flex items-center gap-2">
          <SearchIcon aria-hidden="true" className="size-4" />
          {copy.search.button}
        </span>
        {/* Hidden from the accessible name: without this the button reads
            "Rechercher un prospect… Ctrl K" instead of just its label. */}
        <kbd aria-hidden="true" className="text-muted-foreground text-xs">
          {shortcutHint(navigator.userAgent)}
        </kbd>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={copy.search.button}
        aria-keyshortcuts="Meta+K Control+K"
        className="md:hidden"
        onClick={() => setOpen(true)}
      >
        <SearchIcon aria-hidden="true" />
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.search.button}
        description={copy.search.unavailable}
      >
        <CommandInput placeholder={copy.search.button} />
        <CommandList>
          <CommandEmpty>{copy.search.unavailable}</CommandEmpty>
        </CommandList>
      </CommandDialog>
    </>
  );
}

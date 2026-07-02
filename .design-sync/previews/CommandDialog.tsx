import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "myra-agents";

// CommandDialog wraps this same command palette in a Radix Dialog. The Dialog
// portals to document.body with a fixed, viewport-centered position, so it
// escapes the capture crop (renders blank). We render the dialog's real
// content — the command palette — framed as the floating dialog surface, which
// is the true static render. (See learnings: cfg.overrides recommendation for
// a viewport-mode dialog capture.)
export function Palette() {
  return (
    <div
      style={{
        width: 460,
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 16px 48px rgb(0 0 0 / 0.22)",
        background: "var(--popover)",
      }}
    >
      <Command>
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem>
              Run agent
              <CommandShortcut>⌘R</CommandShortcut>
            </CommandItem>
            <CommandItem>
              New card
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Navigation">
            <CommandItem>
              Open Logs
              <CommandShortcut>⌘L</CommandShortcut>
            </CommandItem>
            <CommandItem>
              Settings
              <CommandShortcut>⌘,</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

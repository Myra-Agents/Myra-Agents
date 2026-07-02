import { Kbd } from "myra-agents";

export function CommandPalette() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        color: "var(--muted-foreground)",
      }}
    >
      <span>Open command palette</span>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </div>
  );
}

export function SingleKey() {
  return <Kbd>Esc</Kbd>;
}

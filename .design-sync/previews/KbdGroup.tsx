import { Kbd, KbdGroup } from "myra-agents";

export function Shortcut() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontSize: 13,
        color: "var(--muted-foreground)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Launch run</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </KbdGroup>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>New card</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>⇧</Kbd>
          <Kbd>N</Kbd>
        </KbdGroup>
      </div>
    </div>
  );
}

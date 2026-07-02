import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "myra-agents";

export function AgentInfoHoverCard() {
  return (
    <HoverCard defaultOpen>
      <HoverCardTrigger asChild>
        <a
          href="#"
          style={{
            fontWeight: 500,
            textDecoration: "underline",
            textUnderlineOffset: 3,
            cursor: "pointer",
          }}
        >
          @claude
        </a>
      </HoverCardTrigger>
      <HoverCardContent align="start">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontWeight: 600 }}>claude</div>
          <p style={{ color: "var(--muted-foreground)", margin: 0 }}>
            Headless CLI coding agent. Runs one card at a time and streams its
            output to the board.
          </p>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            12 runs today · avg 1m 48s
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

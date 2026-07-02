import { Progress } from "myra-agents";

export function RunProgress() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, width: 320 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Cloning workspace · 25%
        </span>
        <Progress value={25} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Running agent · 60%
        </span>
        <Progress value={60} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Run complete · 100%
        </span>
        <Progress value={100} />
      </div>
    </div>
  );
}

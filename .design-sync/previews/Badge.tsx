import { Badge } from "myra-agents";

export function Variants() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <Badge variant="default">Running</Badge>
      <Badge variant="secondary">Draft</Badge>
      <Badge variant="outline">Todo</Badge>
      <Badge variant="destructive">Failed</Badge>
      <Badge variant="ghost">Trash</Badge>
      <Badge variant="link">Details</Badge>
    </div>
  );
}

export function StatusLane() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <Badge variant="secondary">Waiting feedback</Badge>
      <Badge variant="outline">Awaiting review</Badge>
      <Badge variant="default">Done</Badge>
    </div>
  );
}

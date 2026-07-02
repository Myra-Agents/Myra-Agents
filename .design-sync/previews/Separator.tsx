import { Separator } from "myra-agents";

export function Horizontal() {
  return (
    <div style={{ width: 260, fontSize: 14 }}>
      <div>Nightly refactor</div>
      <Separator style={{ margin: "8px 0" }} />
      <div>Weekly digest</div>
    </div>
  );
}

export function Vertical() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 24, fontSize: 14 }}>
      <span>Runs</span>
      <Separator orientation="vertical" />
      <span>Schedules</span>
      <Separator orientation="vertical" />
      <span>Logs</span>
    </div>
  );
}

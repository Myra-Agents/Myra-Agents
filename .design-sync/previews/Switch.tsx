import { Label, Switch } from "myra-agents";

export function States() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Label>
        <Switch defaultChecked /> Stream logs to board
      </Label>
      <Label>
        <Switch /> Pause schedules
      </Label>
      <Label>
        <Switch size="sm" defaultChecked /> Compact cards
      </Label>
    </div>
  );
}

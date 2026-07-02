import { Checkbox, Label } from "myra-agents";

export function States() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Label>
        <Checkbox defaultChecked /> Auto-launch on schedule
      </Label>
      <Label>
        <Checkbox /> Notify on completion
      </Label>
      <Label>
        <Checkbox disabled /> Require review (disabled)
      </Label>
    </div>
  );
}

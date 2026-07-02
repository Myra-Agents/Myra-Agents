import { Input, Label } from "myra-agents";

export function FieldLabel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 280 }}>
      <Label htmlFor="wd">Working directory</Label>
      <Input id="wd" defaultValue="~/Workspace/myra-agents" />
    </div>
  );
}

import { Input, Label } from "myra-agents";

export function TextField() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 280 }}>
      <Label htmlFor="preset">Agent preset name</Label>
      <Input id="preset" defaultValue="claude-headless" />
    </div>
  );
}

export function States() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 280 }}>
      <Input placeholder="Search runs…" />
      <Input defaultValue="myra-server" disabled />
      <Input defaultValue="invalid-path" aria-invalid />
    </div>
  );
}

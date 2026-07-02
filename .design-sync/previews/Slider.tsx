import { Label, Slider } from "myra-agents";

export function Single() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 280 }}>
      <Label>Max concurrent runs</Label>
      <Slider defaultValue={[4]} min={1} max={10} />
    </div>
  );
}

export function Range() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 280 }}>
      <Label>Temperature range</Label>
      <Slider defaultValue={[20, 80]} />
    </div>
  );
}

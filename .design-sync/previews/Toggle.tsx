import { Toggle } from "myra-agents";

export function Variants() {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Toggle>Wrap logs</Toggle>
      <Toggle variant="outline">Follow tail</Toggle>
      <Toggle defaultPressed>Auto-scroll</Toggle>
    </div>
  );
}

export function States() {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Toggle defaultPressed>On</Toggle>
      <Toggle>Off</Toggle>
      <Toggle disabled>Disabled</Toggle>
    </div>
  );
}

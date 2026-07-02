import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "myra-agents";

export function AgentPicker() {
  return (
    <NativeSelect defaultValue="claude" className="w-[220px]">
      <NativeSelectOptGroup label="Coding agents">
        <NativeSelectOption value="claude">claude</NativeSelectOption>
        <NativeSelectOption value="opencode">opencode</NativeSelectOption>
        <NativeSelectOption value="copilot">GitHub Copilot</NativeSelectOption>
      </NativeSelectOptGroup>
      <NativeSelectOptGroup label="Custom">
        <NativeSelectOption value="custom">Custom binary…</NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <NativeSelect size="sm" defaultValue="daily">
        <NativeSelectOption value="daily">Daily</NativeSelectOption>
        <NativeSelectOption value="weekly">Weekly</NativeSelectOption>
        <NativeSelectOption value="cron">Cron</NativeSelectOption>
      </NativeSelect>
      <NativeSelect defaultValue="todo" disabled>
        <NativeSelectOption value="todo">Todo</NativeSelectOption>
        <NativeSelectOption value="doing">In Progress</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}

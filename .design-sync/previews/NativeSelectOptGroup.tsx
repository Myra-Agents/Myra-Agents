import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "myra-agents";

export function GroupedOptions() {
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

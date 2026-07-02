import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "myra-agents";

export function InputScene() {
  return (
    <div style={{ width: 300 }}>
      <Combobox defaultOpen defaultValue="claude">
        <ComboboxInput placeholder="Search agents…" />
        <ComboboxContent>
          <ComboboxEmpty>No agents found.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxGroup>
              <ComboboxLabel>Coding agents</ComboboxLabel>
              <ComboboxItem value="claude">claude</ComboboxItem>
              <ComboboxItem value="opencode">opencode</ComboboxItem>
              <ComboboxItem value="copilot">GitHub Copilot</ComboboxItem>
            </ComboboxGroup>
            <ComboboxSeparator />
            <ComboboxGroup>
              <ComboboxLabel>Custom</ComboboxLabel>
              <ComboboxItem value="custom">Custom binary…</ComboboxItem>
            </ComboboxGroup>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

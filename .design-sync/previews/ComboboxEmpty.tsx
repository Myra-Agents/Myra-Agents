import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxList,
} from "myra-agents";

// Empty state: no items match the current query, so ComboboxEmpty paints.
export function NoResults() {
  return (
    <div style={{ width: 300 }}>
      <Combobox items={[]} defaultOpen>
        <ComboboxInput placeholder="Search agents…" defaultValue="gpt-2" />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxEmpty>No agents match your search.</ComboboxEmpty>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

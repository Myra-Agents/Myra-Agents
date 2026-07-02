import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "myra-agents";

export function SelectedLabels() {
  return (
    <div style={{ width: 300 }}>
      <Combobox multiple defaultOpen defaultValue={["nightly", "ci"]}>
        <ComboboxChips>
          <ComboboxValue>
            {(values: string[]) =>
              values.map((v) => <ComboboxChip key={v}>{v}</ComboboxChip>)
            }
          </ComboboxValue>
          <ComboboxChipsInput placeholder="Add label…" />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value="nightly">nightly</ComboboxItem>
            <ComboboxItem value="ci">ci</ComboboxItem>
            <ComboboxItem value="release">release</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

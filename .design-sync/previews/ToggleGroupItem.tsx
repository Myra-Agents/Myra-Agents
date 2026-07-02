import { ToggleGroup, ToggleGroupItem } from "myra-agents";

export function ViewSwitcher() {
  return (
    <ToggleGroup type="single" defaultValue="board" variant="outline" spacing={0}>
      <ToggleGroupItem value="board">Board</ToggleGroupItem>
      <ToggleGroupItem value="list">List</ToggleGroupItem>
      <ToggleGroupItem value="timeline">Timeline</ToggleGroupItem>
    </ToggleGroup>
  );
}

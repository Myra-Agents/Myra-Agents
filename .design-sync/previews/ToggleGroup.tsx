import { ToggleGroup, ToggleGroupItem } from "myra-agents";

export function SingleSelect() {
  return (
    <ToggleGroup type="single" defaultValue="board" variant="outline">
      <ToggleGroupItem value="board">Board</ToggleGroupItem>
      <ToggleGroupItem value="list">List</ToggleGroupItem>
      <ToggleGroupItem value="timeline">Timeline</ToggleGroupItem>
    </ToggleGroup>
  );
}

export function MultiSelect() {
  return (
    <ToggleGroup type="multiple" defaultValue={["todo", "done"]}>
      <ToggleGroupItem value="todo">Todo</ToggleGroupItem>
      <ToggleGroupItem value="progress">Running</ToggleGroupItem>
      <ToggleGroupItem value="done">Done</ToggleGroupItem>
    </ToggleGroup>
  );
}

import { Button, ButtonGroup, ButtonGroupSeparator } from "myra-agents";

export function WithSeparator() {
  return (
    <ButtonGroup>
      <Button variant="outline">Run agent</Button>
      <ButtonGroupSeparator />
      <Button variant="outline" size="icon">
        ⌄
      </Button>
    </ButtonGroup>
  );
}

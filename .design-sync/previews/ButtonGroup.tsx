import { Button, ButtonGroup } from "myra-agents";

export function Horizontal() {
  return (
    <ButtonGroup>
      <Button variant="outline">Run</Button>
      <Button variant="outline">Pause</Button>
      <Button variant="outline">Stop</Button>
    </ButtonGroup>
  );
}

export function Vertical() {
  return (
    <ButtonGroup orientation="vertical">
      <Button variant="outline">Todo</Button>
      <Button variant="outline">In progress</Button>
      <Button variant="outline">Done</Button>
    </ButtonGroup>
  );
}

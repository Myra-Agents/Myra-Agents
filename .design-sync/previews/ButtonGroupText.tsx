import { Button, ButtonGroup, ButtonGroupText } from "myra-agents";

export function WithLabel() {
  return (
    <ButtonGroup>
      <ButtonGroupText>Agent</ButtonGroupText>
      <Button variant="outline">claude</Button>
      <Button variant="outline">opencode</Button>
    </ButtonGroup>
  );
}

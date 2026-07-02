import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "myra-agents";
import { SendHorizonalIcon } from "lucide-react";

export function PromptComposer() {
  return (
    <InputGroup style={{ width: 340 }}>
      <InputGroupTextarea
        rows={3}
        placeholder="Describe the task for the agent…"
        defaultValue={"Refactor the auth middleware to fix the token expiry off-by-one."}
      />
      <InputGroupAddon align="block-end">
        <InputGroupText>claude · headless</InputGroupText>
        <InputGroupButton variant="default" size="xs" className="ml-auto">
          <SendHorizonalIcon />
          Run
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

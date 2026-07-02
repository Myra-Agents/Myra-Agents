import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "myra-agents";
import { SearchIcon, SendHorizonalIcon } from "lucide-react";

export function SearchField() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 320 }}>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search runs…" defaultValue="auth middleware" />
      </InputGroup>

      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>myra run</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="card id" defaultValue="a1f9c" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton variant="default" size="xs">
            Launch
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

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

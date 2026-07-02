import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "myra-agents";
import { SearchIcon } from "lucide-react";

export function TextScene() {
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

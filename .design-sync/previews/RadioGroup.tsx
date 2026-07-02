import { Label, RadioGroup, RadioGroupItem } from "myra-agents";

export function AgentPicker() {
  return (
    <RadioGroup defaultValue="claude" style={{ maxWidth: 240 }}>
      <Label>
        <RadioGroupItem value="claude" /> Claude
      </Label>
      <Label>
        <RadioGroupItem value="opencode" /> OpenCode
      </Label>
      <Label>
        <RadioGroupItem value="copilot" /> Copilot
      </Label>
    </RadioGroup>
  );
}

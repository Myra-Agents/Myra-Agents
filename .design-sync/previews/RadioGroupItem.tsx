import { Label, RadioGroup, RadioGroupItem } from "myra-agents";

export function Schedule() {
  return (
    <RadioGroup defaultValue="daily" style={{ maxWidth: 240 }}>
      <Label>
        <RadioGroupItem value="once" /> Once
      </Label>
      <Label>
        <RadioGroupItem value="daily" /> Daily
      </Label>
      <Label>
        <RadioGroupItem value="weekly" /> Weekly
      </Label>
    </RadioGroup>
  );
}

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  Input,
  Switch,
} from "myra-agents";

export function AgentSettings() {
  return (
    <div style={{ width: 420 }}>
      <FieldSet>
        <FieldLegend>Agent preset</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="binary">Binary</FieldLabel>
            <Input id="binary" defaultValue="claude" />
            <FieldDescription>
              Executable resolved on PATH, run in headless mode per card.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="args">Args template</FieldLabel>
            <Input id="args" defaultValue="-p {prompt} --output-format stream-json" />
            <FieldError>Args template must contain {"{prompt}"}.</FieldError>
          </Field>
          <FieldSeparator>Advanced</FieldSeparator>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Stream output</FieldTitle>
              <FieldDescription>Push run logs to the board live.</FieldDescription>
            </FieldContent>
            <Switch defaultChecked />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}

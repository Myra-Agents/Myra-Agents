import { Label, Textarea } from "myra-agents";

export function PromptField() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 320 }}>
      <Label htmlFor="prompt">Card prompt</Label>
      <Textarea
        id="prompt"
        defaultValue={
          "Refactor the auth middleware to fix the token-expiry off-by-one, then re-run the test suite."
        }
      />
    </div>
  );
}

export function Disabled() {
  return (
    <Textarea
      style={{ width: 320 }}
      disabled
      defaultValue="Read-only run summary…"
    />
  );
}

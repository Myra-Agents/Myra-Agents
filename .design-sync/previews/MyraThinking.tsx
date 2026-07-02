import { MyraThinking } from "myra-agents";

export function Thinking() {
  return (
    <MyraThinking
      size={28}
      messages={[
        "Reading the codebase…",
        "Planning the refactor…",
        "Running the test suite…",
      ]}
    />
  );
}

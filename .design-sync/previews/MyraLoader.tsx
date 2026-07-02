import { MyraLoader } from "myra-agents";

export function Shimmer() {
  return (
    <div style={{ color: "var(--primary)" }}>
      <MyraLoader size={48} variant="shimmer" />
    </div>
  );
}

export function Assemble() {
  return (
    <div style={{ color: "var(--primary)" }}>
      <MyraLoader size={48} variant="assemble" />
    </div>
  );
}

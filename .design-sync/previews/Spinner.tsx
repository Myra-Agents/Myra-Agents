import { Spinner } from "myra-agents";

export function Sizes() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        color: "var(--primary)",
      }}
    >
      <Spinner className="size-4" />
      <Spinner className="size-6" />
      <Spinner className="size-8" />
    </div>
  );
}

export function Inline() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        color: "var(--muted-foreground)",
      }}
    >
      <Spinner className="size-4" style={{ color: "var(--primary)" }} />
      <span>Starting sidecar…</span>
    </div>
  );
}

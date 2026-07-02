import { Skeleton } from "myra-agents";

export function CardLoading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 280,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Skeleton style={{ height: 32, width: 32, borderRadius: 9999 }} />
        <Skeleton style={{ height: 14, width: 140 }} />
      </div>
      <Skeleton style={{ height: 12, width: "100%" }} />
      <Skeleton style={{ height: 12, width: "80%" }} />
    </div>
  );
}

import { Badge, DirectionProvider } from "myra-agents";

function Row({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}
    >
      <Badge>agent</Badge>
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}

export function LtrRtl() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 280 }}>
      <DirectionProvider dir="ltr">
        <Row label="Left-to-right lane" />
      </DirectionProvider>
      <DirectionProvider dir="rtl">
        <Row label="اتجاه من اليمين لليسار" />
      </DirectionProvider>
    </div>
  );
}

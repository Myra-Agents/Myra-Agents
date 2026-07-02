import { AspectRatio } from "myra-agents";

export function RunThumbnail() {
  return (
    <div style={{ width: 320 }}>
      <AspectRatio ratio={16 / 9}>
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "var(--radius)",
            background:
              "linear-gradient(135deg, var(--primary), var(--accent))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--primary-foreground)",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Run output preview · 16:9
        </div>
      </AspectRatio>
    </div>
  );
}

import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "myra-agents";

export function SettingsSheet() {
  return (
    <Sheet defaultOpen>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Agent preset</SheetTitle>
          <SheetDescription>
            Configure the binary and arguments used when this card launches.
          </SheetDescription>
        </SheetHeader>
        <div
          style={{
            padding: "0 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Binary</span>
            <input
              defaultValue="claude"
              style={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--background)",
                padding: "6px 8px",
                fontSize: 13,
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Args template</span>
            <input
              defaultValue="-p {prompt} --headless"
              style={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--background)",
                padding: "6px 8px",
                fontSize: 13,
                fontFamily: "monospace",
              }}
            />
          </label>
        </div>
        <SheetFooter>
          <Button>Save preset</Button>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

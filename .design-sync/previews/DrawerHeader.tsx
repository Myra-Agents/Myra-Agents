import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "myra-agents";

export function RunSummaryDrawer() {
  return (
    <Drawer defaultOpen>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Run summary</DrawerTitle>
          <DrawerDescription>
            Refactor auth middleware · claude · completed in 2m 14s
          </DrawerDescription>
        </DrawerHeader>
        <div
          style={{
            padding: "0 16px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--muted-foreground)" }}>Files changed</span>
            <span>4</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--muted-foreground)" }}>Tests</span>
            <span>128 passed</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--muted-foreground)" }}>Working dir</span>
            <code>~/src/myra/app</code>
          </div>
        </div>
        <DrawerFooter>
          <Button>Move to Awaiting Review</Button>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "myra-agents";

export function BoardSplit() {
  return (
    <div style={{ width: 520, height: 240 }}>
      <ResizablePanelGroup
        direction="horizontal"
        className="rounded-md border"
      >
        <ResizablePanel defaultSize={40}>
          <div className="flex h-full flex-col gap-2 p-4 text-sm">
            <div className="font-medium">Board</div>
            <div className="text-muted-foreground">Todo · 4</div>
            <div className="text-muted-foreground">In Progress · 2</div>
            <div className="text-muted-foreground">Done · 11</div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={60}>
          <div className="flex h-full flex-col gap-1 p-4 text-sm">
            <div className="font-medium">Refactor auth middleware</div>
            <div className="text-xs text-muted-foreground">claude · Running · 2m 14s</div>
            <p className="mt-2 text-muted-foreground">
              Patching the token expiry guard and re-running the suite.
            </p>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

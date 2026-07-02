import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "myra-agents";

export function RunPanels() {
  return (
    <Tabs defaultValue="logs" style={{ width: 460 }}>
      <TabsList>
        <TabsTrigger value="logs">Logs</TabsTrigger>
        <TabsTrigger value="diff">Diff</TabsTrigger>
        <TabsTrigger value="output">Output</TabsTrigger>
      </TabsList>
      <TabsContent value="logs">
        <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs">
          <div>[10:02:14] spawning claude · headless</div>
          <div>[10:02:16] reading src/lib/auth.ts</div>
          <div>[10:02:19] patch applied · re-running suite</div>
        </div>
      </TabsContent>
      <TabsContent value="diff">
        <div className="p-3 text-sm text-muted-foreground">2 files changed, 14 insertions</div>
      </TabsContent>
      <TabsContent value="output">
        <div className="p-3 text-sm text-muted-foreground">Exit code 0 · 5m 02s</div>
      </TabsContent>
    </Tabs>
  );
}

export function LineVariant() {
  return (
    <Tabs defaultValue="todo" style={{ width: 460 }}>
      <TabsList variant="line">
        <TabsTrigger value="todo">Todo</TabsTrigger>
        <TabsTrigger value="progress">In Progress</TabsTrigger>
        <TabsTrigger value="done" disabled>
          Done
        </TabsTrigger>
      </TabsList>
      <TabsContent value="todo">
        <div className="p-3 text-sm">4 cards queued for the next iteration.</div>
      </TabsContent>
      <TabsContent value="progress">
        <div className="p-3 text-sm">2 agents currently running.</div>
      </TabsContent>
    </Tabs>
  );
}

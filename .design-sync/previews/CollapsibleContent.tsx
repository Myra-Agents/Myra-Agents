import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "myra-agents";

export function ScheduleDisclosure() {
  return (
    <Collapsible defaultOpen style={{ width: 380 }}>
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div className="text-sm font-medium">Nightly triage</div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            Details
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Cadence</span>
            <Badge variant="secondary">daily · 02:00</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Materializes</span>
            <span>3 cards → Todo</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Agent</span>
            <span>claude</span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

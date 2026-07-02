import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "myra-agents";

export function SchedulePopover() {
  return (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          Edit schedule
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>Nightly build</PopoverTitle>
          <PopoverDescription>
            Materializes cards on a cron schedule.
          </PopoverDescription>
        </PopoverHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Cron</span>
            <input
              defaultValue="0 2 * * *"
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
          <div
            style={{
              fontSize: 12,
              color: "var(--muted-foreground)",
            }}
          >
            Next run: today at 02:00
          </div>
          <Button size="sm">Save schedule</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

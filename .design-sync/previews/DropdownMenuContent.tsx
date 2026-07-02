import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "myra-agents";

export function RunActions() {
  return (
    <div style={{ minHeight: 420, minWidth: 460 }}>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Run actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" style={{ width: 248 }}>
          <DropdownMenuLabel>Refactor auth middleware</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem>
              Open run
              <DropdownMenuShortcut>⏎</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              Re-run agent
              <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              View logs
              <DropdownMenuShortcut>⌘L</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Options</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>Stream output</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>Notify on finish</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Agent</DropdownMenuLabel>
          <DropdownMenuRadioGroup value="claude">
            <DropdownMenuRadioItem value="claude">claude</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="opencode">opencode</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="copilot">copilot</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuSub defaultOpen>
            <DropdownMenuSubTrigger>Move to lane</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Todo</DropdownMenuItem>
              <DropdownMenuItem>In Progress</DropdownMenuItem>
              <DropdownMenuItem>Awaiting Review</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            Delete run
            <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

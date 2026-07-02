import * as React from "react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "myra-agents";

export function CardMenu() {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: Math.round(r.left + 20),
        clientY: Math.round(r.bottom + 4),
      }),
    );
  }, []);
  return (
    <div style={{ minHeight: 440, minWidth: 480, padding: 8 }}>
      <ContextMenu>
        <ContextMenuTrigger
          ref={ref}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 64,
            width: 200,
            borderRadius: 8,
            border: "1px dashed var(--border)",
            color: "var(--muted-foreground)",
            fontSize: 13,
          }}
        >
          Right-click card
        </ContextMenuTrigger>
        <ContextMenuContent avoidCollisions={false} style={{ width: 240 }}>
          <ContextMenuLabel>Nightly test run</ContextMenuLabel>
          <ContextMenuGroup>
            <ContextMenuItem>
              Open run
              <ContextMenuShortcut>⏎</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem>
              Re-run agent
              <ContextMenuShortcut>⌘R</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem>
              Copy prompt
              <ContextMenuShortcut>⌘C</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem checked>Pin to top</ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem>Watch schedule</ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <ContextMenuLabel>Priority</ContextMenuLabel>
          <ContextMenuRadioGroup value="high">
            <ContextMenuRadioItem value="high">High</ContextMenuRadioItem>
            <ContextMenuRadioItem value="normal">Normal</ContextMenuRadioItem>
            <ContextMenuRadioItem value="low">Low</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuSeparator />
          <ContextMenuSub defaultOpen>
            <ContextMenuSubTrigger>Move to lane</ContextMenuSubTrigger>
            <ContextMenuSubContent avoidCollisions={false}>
              <ContextMenuItem>Todo</ContextMenuItem>
              <ContextMenuItem>In Progress</ContextMenuItem>
              <ContextMenuItem>Done</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive">
            Delete run
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "myra-agents";

export function BoardMenubar() {
  return (
    <div style={{ minHeight: 440, minWidth: 480, paddingTop: 8 }}>
      <Menubar defaultValue="run">
        <MenubarMenu value="run">
          <MenubarTrigger>Run</MenubarTrigger>
          <MenubarContent avoidCollisions={false} style={{ width: 240 }}>
            <MenubarLabel>Nightly test run</MenubarLabel>
            <MenubarGroup>
              <MenubarItem>
                Launch agent
                <MenubarShortcut>⌘↵</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>
                Re-run
                <MenubarShortcut>⌘R</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>
                View logs
                <MenubarShortcut>⌘L</MenubarShortcut>
              </MenubarItem>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarCheckboxItem checked>Stream output</MenubarCheckboxItem>
            <MenubarCheckboxItem>Notify on finish</MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarLabel>Agent</MenubarLabel>
            <MenubarRadioGroup value="claude">
              <MenubarRadioItem value="claude">claude</MenubarRadioItem>
              <MenubarRadioItem value="opencode">opencode</MenubarRadioItem>
            </MenubarRadioGroup>
            <MenubarSeparator />
            <MenubarSub defaultOpen>
              <MenubarSubTrigger>Move to lane</MenubarSubTrigger>
              <MenubarSubContent avoidCollisions={false}>
                <MenubarItem>Todo</MenubarItem>
                <MenubarItem>In Progress</MenubarItem>
                <MenubarItem>Done</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem variant="destructive">Delete run</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu value="board">
          <MenubarTrigger>Board</MenubarTrigger>
        </MenubarMenu>
        <MenubarMenu value="schedules">
          <MenubarTrigger>Schedules</MenubarTrigger>
        </MenubarMenu>
      </Menubar>
    </div>
  );
}

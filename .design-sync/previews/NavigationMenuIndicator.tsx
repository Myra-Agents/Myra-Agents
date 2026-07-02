import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "myra-agents";

export function TopNav() {
  return (
    <div style={{ padding: 16, minHeight: 280, minWidth: 460 }}>
      <NavigationMenu defaultValue="agents">
        <NavigationMenuList>
          <NavigationMenuItem value="agents">
            <NavigationMenuTrigger>Agents</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul
                style={{
                  display: "grid",
                  gap: 4,
                  width: 360,
                  padding: 4,
                  margin: 0,
                  listStyle: "none",
                }}
              >
                <li>
                  <NavigationMenuLink href="#">
                    <div>
                      <div style={{ fontWeight: 600 }}>claude</div>
                      <div
                        style={{ fontSize: 12, color: "var(--muted-foreground)" }}
                      >
                        Anthropic CLI · headless runs
                      </div>
                    </div>
                  </NavigationMenuLink>
                </li>
                <li>
                  <NavigationMenuLink href="#">
                    <div>
                      <div style={{ fontWeight: 600 }}>opencode</div>
                      <div
                        style={{ fontSize: 12, color: "var(--muted-foreground)" }}
                      >
                        Open-source coding agent
                      </div>
                    </div>
                  </NavigationMenuLink>
                </li>
                <li>
                  <NavigationMenuLink href="#">
                    <div>
                      <div style={{ fontWeight: 600 }}>copilot</div>
                      <div
                        style={{ fontSize: 12, color: "var(--muted-foreground)" }}
                      >
                        GitHub Copilot CLI
                      </div>
                    </div>
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem value="runs">
            <NavigationMenuTrigger>Runs</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul
                style={{
                  display: "grid",
                  gap: 4,
                  width: 240,
                  padding: 4,
                  margin: 0,
                  listStyle: "none",
                }}
              >
                <li>
                  <NavigationMenuLink href="#">Active runs</NavigationMenuLink>
                </li>
                <li>
                  <NavigationMenuLink href="#">History</NavigationMenuLink>
                </li>
                <li>
                  <NavigationMenuLink href="#">Awaiting review</NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem value="schedules">
            <NavigationMenuLink href="#">Schedules</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuIndicator />
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  );
}

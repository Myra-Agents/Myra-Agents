import {
  Badge,
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "myra-agents";

function BotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}

export function RunList() {
  return (
    <div style={{ width: 460 }}>
      <ItemGroup>
        <Item variant="outline">
          <ItemHeader>
            <ItemTitle>Refactor auth middleware</ItemTitle>
            <Badge variant="secondary">In Progress</Badge>
          </ItemHeader>
          <ItemMedia variant="icon">
            <BotIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>claude · headless</ItemTitle>
            <ItemDescription>
              Patching the token expiry guard and re-running the suite.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button size="sm" variant="outline">Open run</Button>
          </ItemActions>
          <ItemFooter>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Started 2m ago · ~/repos/api</span>
          </ItemFooter>
        </Item>
        <ItemSeparator />
        <Item variant="outline">
          <ItemMedia variant="icon">
            <BotIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Generate release notes</ItemTitle>
            <ItemDescription>opencode · completed in 41s.</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button size="sm" variant="ghost">View logs</Button>
          </ItemActions>
        </Item>
      </ItemGroup>
    </div>
  );
}

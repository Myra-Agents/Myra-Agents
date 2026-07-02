import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "myra-agents";

export function ModelItems() {
  return (
    <Select defaultOpen defaultValue="sonnet">
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Anthropic</SelectLabel>
          <SelectItem value="opus">Claude Opus 4.8</SelectItem>
          <SelectItem value="sonnet">Claude Sonnet 4.5</SelectItem>
          <SelectItem value="haiku">Claude Haiku 4.5</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Local agents</SelectLabel>
          <SelectItem value="opencode">opencode</SelectItem>
          <SelectItem value="copilot">GitHub Copilot</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

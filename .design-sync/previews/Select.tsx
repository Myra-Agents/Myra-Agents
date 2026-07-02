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

export function ModelPicker() {
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
          <SelectItem value="custom" disabled>
            Custom (configure first)
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function Closed() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Select defaultValue="sonnet">
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Model" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="sonnet">Claude Sonnet 4.5</SelectItem>
          <SelectItem value="opus">Claude Opus 4.8</SelectItem>
        </SelectContent>
      </Select>
      <Select disabled>
        <SelectTrigger size="sm" className="w-[160px]">
          <SelectValue placeholder="Disabled" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

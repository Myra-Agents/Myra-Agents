import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "myra-agents";

// Long list forces overflow so the scroll up/down buttons paint inside SelectContent.
export function ScrollDown() {
  return (
    <Select defaultOpen defaultValue="opus">
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-[168px]">
        <SelectGroup>
          <SelectLabel>Models</SelectLabel>
          <SelectItem value="opus">Claude Opus 4.8</SelectItem>
          <SelectItem value="sonnet">Claude Sonnet 4.5</SelectItem>
          <SelectItem value="haiku">Claude Haiku 4.5</SelectItem>
          <SelectItem value="opencode">opencode</SelectItem>
          <SelectItem value="copilot">GitHub Copilot</SelectItem>
          <SelectItem value="gemini">Gemini 2.5 Pro</SelectItem>
          <SelectItem value="gpt">GPT-5</SelectItem>
          <SelectItem value="qwen">Qwen 3 Coder</SelectItem>
          <SelectItem value="deepseek">DeepSeek V3</SelectItem>
          <SelectItem value="llama">Llama 4 Maverick</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

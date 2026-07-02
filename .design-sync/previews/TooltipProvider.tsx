import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "myra-agents";

export function IconButtonTooltip() {
  return (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Re-run">
            ↻
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Re-run this card</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

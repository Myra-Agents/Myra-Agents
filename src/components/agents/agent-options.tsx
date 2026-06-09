"use client";

import { useMemo, useState } from "react";

import { CheckIcon, GitBranchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AgentFlagDef } from "@/types/settings";
import { AGENT_FLAG_CATALOG } from "@/types/settings";

interface AgentOptionsProps {
  /** Binary the preset runs — selects the flag catalog (e.g. "opencode"). */
  binary: string;
  flags: string[];
  useWorktree: boolean;
  onFlagsChange: (flags: string[]) => void;
  onWorktreeChange: (useWorktree: boolean) => void;
}

function flagName(token: string): string {
  return token.split("=")[0];
}

function isSet(flags: string[], def: AgentFlagDef): boolean {
  return flags.some((token) => flagName(token) === def.flag);
}

function flagValue(flags: string[], def: AgentFlagDef): string {
  const token = flags.find((item) => flagName(item) === def.flag);
  const eq = token?.indexOf("=") ?? -1;
  return eq >= 0 && token ? token.slice(eq + 1) : "";
}

/**
 * Checkbox + multiselect editor for an agent's CLI flags and the worktree
 * toggle. Featured flags render as dedicated checkboxes; every catalog flag is
 * reachable through the "all options" popover. Value-taking flags get an
 * inline input and are stored as `--flag=value` tokens.
 */
export function AgentOptions({ binary, flags, useWorktree, onFlagsChange, onWorktreeChange }: AgentOptionsProps) {
  const t = useTranslations("agents");
  const [pickerOpen, setPickerOpen] = useState(false);

  const catalog = useMemo(() => AGENT_FLAG_CATALOG[binary.trim()] ?? [], [binary]);
  const featured = catalog.filter((def) => def.featured);
  const knownFlags = useMemo(() => new Set(catalog.map((def) => def.flag)), [catalog]);
  // Selected flags that need a row below the checkboxes: value-taking ones,
  // non-featured catalog flags, and anything custom from the args template era.
  const extraSelected = flags.filter((token) => {
    const def = catalog.find((item) => item.flag === flagName(token));
    return !def?.featured || def.takesValue;
  });

  const setFlag = (def: AgentFlagDef, enabled: boolean) => {
    const rest = flags.filter((token) => flagName(token) !== def.flag);
    if (!enabled) {
      onFlagsChange(rest);
      return;
    }
    onFlagsChange([...rest, def.takesValue ? `${def.flag}=` : def.flag]);
  };

  const setFlagValue = (def: AgentFlagDef, value: string) => {
    onFlagsChange(flags.map((token) => (flagName(token) === def.flag ? `${def.flag}=${value}` : token)));
  };

  const removeToken = (token: string) => {
    onFlagsChange(flags.filter((item) => item !== token));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Label className="flex cursor-pointer items-center gap-2 font-normal text-xs">
          <Checkbox checked={useWorktree} onCheckedChange={(checked) => onWorktreeChange(checked === true)} />
          <span className="flex items-center gap-1">
            <GitBranchIcon className="size-3 text-muted-foreground" />
            {t("optionWorktree")}
          </span>
        </Label>

        {featured.map((def) => (
          <Label key={def.flag} className="flex cursor-pointer items-center gap-2 font-normal text-xs">
            <Checkbox checked={isSet(flags, def)} onCheckedChange={(checked) => setFlag(def, checked === true)} />
            <span className={cn(def.danger && "text-destructive")} title={def.flag}>
              {t(`flags.${def.flag}`)}
            </span>
          </Label>
        ))}

        {catalog.length > 0 && (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="xs">
                <SlidersHorizontalIcon className="size-3" />
                {t("allOptions")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command>
                <CommandInput placeholder={t("searchOptions")} />
                <CommandList>
                  <CommandEmpty>{t("noOptionFound")}</CommandEmpty>
                  <CommandGroup>
                    {catalog.map((def) => {
                      const selected = isSet(flags, def);
                      return (
                        <CommandItem
                          key={def.flag}
                          value={`${def.flag} ${def.hint}`}
                          onSelect={() => setFlag(def, !selected)}
                        >
                          <CheckIcon className={cn("size-3.5", selected ? "opacity-100" : "opacity-0")} />
                          <span className={cn("font-mono text-xs", def.danger && "text-destructive")}>{def.flag}</span>
                          <span className="ml-auto truncate text-[10px] text-muted-foreground">{def.hint}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {extraSelected.length > 0 && (
        <div className="space-y-1.5">
          {extraSelected.map((token) => {
            const def = catalog.find((item) => item.flag === flagName(token));
            if (def?.takesValue) {
              return (
                <div key={def.flag} className="flex items-center gap-2">
                  <Label className="w-32 shrink-0 font-mono text-xs" title={def.hint}>
                    {def.flag}
                  </Label>
                  <Input
                    value={flagValue(flags, def)}
                    onChange={(event) => setFlagValue(def, event.target.value)}
                    placeholder={def.valuePlaceholder}
                    className="h-7 font-mono text-xs"
                  />
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => setFlag(def, false)}>
                    <XIcon className="size-3" />
                  </Button>
                </div>
              );
            }
            // Boolean flag from the picker, or a custom token we don't know.
            if (def?.featured && !def.takesValue) return null;
            return (
              <div key={token} className="flex items-center gap-2">
                <span
                  className={cn("font-mono text-xs", def?.danger && "text-destructive")}
                  title={def?.hint ?? (knownFlags.has(flagName(token)) ? undefined : t("customFlag"))}
                >
                  {token}
                </span>
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeToken(token)}>
                  <XIcon className="size-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

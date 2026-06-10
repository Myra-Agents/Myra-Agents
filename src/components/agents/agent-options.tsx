"use client";

import { useEffect, useMemo, useState } from "react";

import { CheckIcon, GitBranchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invoke } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { AgentFlagDef, AgentModelCost, AgentModelsResult } from "@/types/settings";
import { AGENT_FLAG_CATALOG, opencodeVariantsForModel, sortOpencodeVariants } from "@/types/settings";

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

/** $/M-token pricing for a model: green "free" badge, muted price, or nothing. */
function ModelCostHint({ cost }: { cost?: AgentModelCost }) {
  const t = useTranslations("agents");
  if (!cost) return null;
  if (cost.input === 0 && cost.output === 0) {
    return (
      <Badge variant="outline" className="border-green-500/30 bg-green-500/10 px-1.5 text-[10px] text-green-600">
        {t("modelFree")}
      </Badge>
    );
  }
  return (
    <span className="whitespace-nowrap text-[10px] text-muted-foreground">
      {t("modelCost", { input: String(cost.input), output: String(cost.output) })}
    </span>
  );
}

/** Sentinel for "flag not set" in the effort dropdown (= the model's default effort). */
const DEFAULT_VALUE = "__default__";

/**
 * Searchable model picker for a featured value flag. Presentational — the
 * `list_models` fetch lives in {@link AgentOptions} (the effort dropdown needs
 * the per-model variants too); when the rpc is unavailable (older sidecar,
 * binary missing) it degrades to a free-text input so the flag stays editable.
 */
function ModelPicker({
  def,
  value,
  onChange,
  models,
  cost,
  failed,
  onOpen,
}: {
  def: AgentFlagDef;
  value: string;
  onChange: (value: string) => void;
  models: string[] | null;
  cost?: Record<string, AgentModelCost>;
  failed: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("agents");
  const [open, setOpen] = useState(false);

  if (failed) {
    return (
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={def.valuePlaceholder}
        className="h-7 w-48 font-mono text-xs"
        title={def.flag}
      />
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onOpen();
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="xs" title={def.flag} className="max-w-56">
          <span className={cn("truncate", value ? "font-mono" : "text-muted-foreground")}>
            {value || t("selectModel")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder={t("searchModels")} />
          <CommandList>
            <CommandEmpty>{models === null ? t("loadingModels") : t("noModelFound")}</CommandEmpty>
            <CommandGroup>
              {(models ?? []).map((model) => (
                <CommandItem
                  key={model}
                  value={model}
                  onSelect={() => {
                    onChange(model);
                    setOpen(false);
                  }}
                >
                  <CheckIcon className={cn("size-3.5", value === model ? "opacity-100" : "opacity-0")} />
                  <span className="truncate font-mono text-xs">{model}</span>
                  <span className="ml-auto">
                    <ModelCostHint cost={cost?.[model]} />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Checkbox + dropdown + multiselect editor for an agent's CLI flags and the
 * worktree toggle. Featured boolean flags render as dedicated checkboxes;
 * featured value flags (model, effort) render as dropdowns — the model list is
 * fetched live from the agent CLI, the effort choices are the selected model's
 * own variants. Every catalog flag stays reachable through the "all
 * options" popover; value-taking flags are stored as `--flag=value` tokens.
 */
export function AgentOptions({ binary, flags, useWorktree, onFlagsChange, onWorktreeChange }: AgentOptionsProps) {
  const t = useTranslations("agents");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modelsResult, setModelsResult] = useState<AgentModelsResult | null>(null);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [modelsRequested, setModelsRequested] = useState(false);

  const catalog = useMemo(() => AGENT_FLAG_CATALOG[binary.trim()] ?? [], [binary]);
  const featuredBools = catalog.filter((def) => def.featured && !def.takesValue);
  const featuredValues = catalog.filter((def) => def.featured && def.takesValue);
  const knownFlags = useMemo(() => new Set(catalog.map((def) => def.flag)), [catalog]);
  // Selected flags that need a row below the checkboxes: value-taking ones
  // without a dedicated dropdown, non-featured catalog flags, and anything
  // custom from the args template era.
  const extraSelected = flags.filter((token) => {
    const def = catalog.find((item) => item.flag === flagName(token));
    return !def?.featured;
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

  // Set/replace `--flag=value`; an empty value drops the flag entirely.
  const setValueFlag = (def: AgentFlagDef, value: string) => {
    const rest = flags.filter((token) => flagName(token) !== def.flag);
    onFlagsChange(value ? [...rest, `${def.flag}=${value}`] : rest);
  };

  const removeToken = (token: string) => {
    onFlagsChange(flags.filter((item) => item !== token));
  };

  const modelDef = featuredValues.find((def) => def.optionsRpc === "list_models");
  const modelValue = modelDef ? flagValue(flags, modelDef) : "";

  // Reset the fetched models when the preset's binary changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: binary is the reset trigger
  useEffect(() => {
    setModelsResult(null);
    setModelsFailed(false);
    setModelsRequested(false);
  }, [binary]);

  // Fetch models lazily — when the picker opens, or right away when a model is
  // already set (the effort dropdown needs its variants). The rpc shells out
  // to the agent CLI on the connected machine.
  useEffect(() => {
    if (!modelDef || modelsResult !== null || modelsFailed) return;
    if (!modelsRequested && !modelValue) return;
    let cancelled = false;
    invoke<AgentModelsResult>("list_models", { binary: binary.trim() })
      .then((result) => {
        if (cancelled) return;
        if (result.models.length > 0) setModelsResult(result);
        else setModelsFailed(true);
      })
      .catch(() => {
        if (!cancelled) setModelsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [modelDef, modelsResult, modelsFailed, modelsRequested, modelValue, binary]);

  // Effort choices for a model: exact per-model list from the rpc when the
  // server provides one (absent/empty = the model has no variants), otherwise
  // the static per-provider fallback. No model selected → none.
  const variantChoicesFor = (model: string): string[] => {
    if (!model) return [];
    const fromRpc = modelsResult?.variants;
    if (fromRpc) return sortOpencodeVariants(fromRpc[model] ?? []);
    return opencodeVariantsForModel(model);
  };

  // Static, rpc-derived or provider-derived choices for a featured value flag.
  // `--variant` is opencode's reasoning effort — its choices depend on the
  // selected model.
  const choicesFor = (def: AgentFlagDef): string[] | undefined => {
    if (def.options) return def.options;
    if (def.flag === "--variant") return variantChoicesFor(modelValue);
    return undefined;
  };

  // Model changes go through here so a `--variant` the new model doesn't
  // support is dropped in the same update.
  const setModelFlag = (def: AgentFlagDef, value: string) => {
    let next = flags.filter((token) => flagName(token) !== def.flag);
    if (value) next = [...next, `${def.flag}=${value}`];
    const variantDef = catalog.find((item) => item.flag === "--variant");
    if (variantDef) {
      const current = flagValue(next, variantDef);
      if (current && !variantChoicesFor(value).includes(current)) {
        next = next.filter((token) => flagName(token) !== variantDef.flag);
      }
    }
    onFlagsChange(next);
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

        {featuredBools.map((def) => (
          <Label key={def.flag} className="flex cursor-pointer items-center gap-2 font-normal text-xs">
            <Checkbox checked={isSet(flags, def)} onCheckedChange={(checked) => setFlag(def, checked === true)} />
            <span className={cn(def.danger && "text-destructive")} title={def.flag}>
              {t(`flags.${def.flag}`)}
            </span>
          </Label>
        ))}

        {featuredValues.map((def) => {
          const value = flagValue(flags, def);
          const choices = choicesFor(def);
          // Effort is meaningless until a model is picked, and some models
          // (e.g. opencode/big-pickle) support no variants at all.
          const variantDisabled = def.flag === "--variant" && (!modelValue || choices?.length === 0);
          const disabledHint = !modelValue ? t("effortNeedsModel") : t("effortNoVariants");
          return (
            <div key={def.flag} className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs" title={def.flag}>
                {t(`flags.${def.flag}`)}
              </span>
              {def.optionsRpc === "list_models" ? (
                <>
                  <ModelPicker
                    def={def}
                    value={value}
                    onChange={(v) => setModelFlag(def, v)}
                    models={modelsResult?.models ?? null}
                    cost={modelsResult?.cost}
                    failed={modelsFailed}
                    onOpen={() => setModelsRequested(true)}
                  />
                  {value !== "" && <ModelCostHint cost={modelsResult?.cost?.[value]} />}
                </>
              ) : choices ? (
                <Select
                  value={value || DEFAULT_VALUE}
                  onValueChange={(v) => setValueFlag(def, v === DEFAULT_VALUE ? "" : v)}
                  disabled={variantDisabled}
                >
                  <SelectTrigger size="sm" className="text-xs" title={variantDisabled ? disabledHint : def.flag}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_VALUE}>
                      <span className="text-xs">{t("defaultOption")}</span>
                    </SelectItem>
                    {choices.map((choice) => (
                      <SelectItem key={choice} value={choice}>
                        <span className="font-mono text-xs">{choice}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={value}
                  onChange={(event) => setValueFlag(def, event.target.value)}
                  placeholder={def.valuePlaceholder}
                  className="h-7 w-40 font-mono text-xs"
                  title={def.flag}
                />
              )}
            </div>
          );
        })}

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

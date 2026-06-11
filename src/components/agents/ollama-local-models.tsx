"use client";

import { type ReactNode, useState } from "react";

import {
  BoltIcon,
  CheckCircle2Icon,
  CheckIcon,
  DownloadIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
  Settings2Icon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import type { UseOllama } from "@/hooks/use-ollama";
import { useOllama } from "@/hooks/use-ollama";
import { openExternal } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { AgentModelCost, OllamaPullProgress } from "@/types/settings";
import { OLLAMA_INSTALL_INFO, OLLAMA_MODEL_CATALOG } from "@/types/settings";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Percentage for a pull progress frame, or null when bytes aren't known yet. */
function pullPct(p?: OllamaPullProgress): number | null {
  if (!p?.total || !p.completed) return null;
  return Math.min(100, Math.round((p.completed / p.total) * 100));
}

/** Inline pull-progress line (label + bar/percent), or null when idle. */
function PullProgressLine({ progress }: { progress?: OllamaPullProgress }) {
  if (!progress) return null;
  const pct = pullPct(progress);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Loader2Icon className="size-3 animate-spin" />
          {progress.status}
        </span>
        {pct !== null && <span>{pct}%</span>}
      </div>
      {pct !== null && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}

/**
 * Full local-model management surface: daemon status, curated catalogue + a
 * free-form tag pull, and the installed-model list with remove. Reused inside the
 * install dialog (once Ollama is ready) and the Settings → Local models panel.
 */
export function LocalModelManager({ ollama }: { ollama: UseOllama }) {
  const t = useTranslations("agents");
  const { status, pulling, pull, cancelPull, remove } = ollama;
  const [customTag, setCustomTag] = useState("");

  const installed = new Set((status?.models ?? []).map((m) => m.name.replace(/:latest$/, "")));
  const isInstalled = (tag: string) => installed.has(tag.replace(/:latest$/, ""));
  const isPulling = (tag: string) => Boolean(pulling[tag] || pulling[`${tag}:latest`]);

  const doPull = async (tag: string) => {
    try {
      await pull(tag);
      toast.success(t("local.pullDone", { model: tag }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("local.pullFailed", { model: tag }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Installed models */}
      {(status?.models?.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <p className="font-medium text-muted-foreground text-xs">{t("local.installed")}</p>
          {status?.models.map((model) => (
            <div key={model.name} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <span className="size-1.5 rounded-full bg-green-500" />
              <span className="font-mono text-xs">{model.name}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{formatBytes(model.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title={t("local.remove")}
                onClick={() => void remove(model.name)}
              >
                <TrashIcon className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Curated catalogue */}
      <div className="space-y-1.5">
        <p className="font-medium text-muted-foreground text-xs">{t("local.catalog")}</p>
        {OLLAMA_MODEL_CATALOG.filter((m) => !isInstalled(m.tag)).map((model) => {
          const progress = pulling[model.tag] ?? pulling[`${model.tag}:latest`];
          return (
            <div key={model.tag} className="space-y-1 border-b py-1.5 last:border-0">
              <div className="flex items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{model.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {model.size} · {t("local.minRam", { ram: model.minRam })} · {model.blurb}
                  </p>
                </div>
                {isPulling(model.tag) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void cancelPull(model.tag)}
                  >
                    <XIcon className="size-3" />
                    {t("local.cancel")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="ml-auto shrink-0"
                    onClick={() => void doPull(model.tag)}
                  >
                    <DownloadIcon className="size-3" />
                    {t("local.pull")}
                  </Button>
                )}
              </div>
              <PullProgressLine progress={progress} />
            </div>
          );
        })}
      </div>

      {/* Free-form tag */}
      <div className="space-y-1.5">
        <p className="font-medium text-muted-foreground text-xs">{t("local.customPull")}</p>
        <div className="flex items-center gap-2">
          <Input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder={t("local.customPlaceholder")}
            className="h-8 font-mono text-xs"
          />
          <Button
            type="button"
            size="sm"
            disabled={!customTag.trim() || isPulling(customTag.trim())}
            onClick={() => {
              const tag = customTag.trim();
              setCustomTag("");
              void doPull(tag);
            }}
          >
            <DownloadIcon className="size-3.5" />
            {t("local.pull")}
          </Button>
        </div>
        {customTag.trim() && pulling[customTag.trim()] && <PullProgressLine progress={pulling[customTag.trim()]} />}
      </div>
    </div>
  );
}

/** Small daemon/version status line for the dialog + settings panel header. */
function DaemonStatus({ ollama }: { ollama: UseOllama }) {
  const t = useTranslations("agents");
  const { status } = ollama;
  if (!status) return null;
  const ok = status.installed && status.running && status.launchCapable;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-xs",
        ok ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", ok ? "bg-green-500" : "bg-muted-foreground")} />
      {ok
        ? t("local.daemonReady", { version: status.version ?? "" })
        : status.installed
          ? status.running
            ? t("local.versionTooOld", { version: status.version ?? "?" })
            : t("local.daemonStopped")
          : t("local.notInstalled")}
    </div>
  );
}

/**
 * Install/serve/manage dialog — the on-ramp opened from the "enable local models"
 * affordance. Walks three substates: not installed → install; installed but old
 * → update hint; installed but daemon down → start. Once ready it renders the
 * full {@link LocalModelManager}.
 */
export function OllamaInstallDialog({
  ollama,
  open,
  onOpenChange,
}: {
  ollama: UseOllama;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("agents");
  const { status, busy, install, serve } = ollama;

  const runInstall = async () => {
    try {
      await install();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("local.installFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BoltIcon className="size-4 text-primary" />
            {t("local.dialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("local.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <DaemonStatus ollama={ollama} />

        {!status?.installed ? (
          <div className="space-y-3">
            <Button type="button" className="w-full" disabled={busy} onClick={() => void runInstall()}>
              {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <DownloadIcon className="size-3.5" />}
              {t("local.installNow")}
            </Button>
            <button
              type="button"
              className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => openExternal(OLLAMA_INSTALL_INFO.docsUrl)}
            >
              {t("local.installManually")}
            </button>
          </div>
        ) : !status.launchCapable ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">{t("local.updateHint")}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => void runInstall()}
              >
                {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />}
                {t("local.update")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => openExternal(OLLAMA_INSTALL_INFO.docsUrl)}
              >
                {t("local.openDownloads")}
              </Button>
            </div>
          </div>
        ) : !status.running ? (
          <Button type="button" className="w-full" disabled={busy} onClick={() => void serve()}>
            {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlayIcon className="size-3.5" />}
            {t("local.startDaemon")}
          </Button>
        ) : (
          <>
            <div className="flex items-center gap-2 text-green-600 text-xs">
              <CheckCircle2Icon className="size-3.5" />
              {t("local.ready")}
            </div>
            <LocalModelManager ollama={ollama} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One cloud-model row's $/M cost as muted text, or a green "free" badge. */
function CostHint({ cost }: { cost?: AgentModelCost }) {
  const t = useTranslations("agents");
  if (!cost) return null;
  if (cost.input === 0 && cost.output === 0) {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-green-500/30 bg-green-500/10 px-1.5 text-[10px] text-green-600"
      >
        {t("modelFree")}
      </Badge>
    );
  }
  return (
    <span className="shrink-0 text-[10px] text-muted-foreground">
      {t("modelCost", { input: String(cost.input), output: String(cost.output) })}
    </span>
  );
}

/**
 * Fixed-width leading cell so every row's label starts at the same x regardless
 * of which status glyph it carries (check / dot / download / none).
 */
function Gutter({ children }: { children?: ReactNode }) {
  return <span className="flex size-4 shrink-0 items-center justify-center">{children}</span>;
}

/**
 * The model picker for an Ollama-launchable harness preset: one popover with a
 * CLOUD group (the harness's own provider models, via `list_models`) **and** a
 * LOCAL · OLLAMA group. Picking a cloud model sets the `--model` flag and runs
 * direct; picking a local model sets `ollamaModel` + `launchVia="ollama"`.
 * Not-yet-pulled catalogue models appear greyed with a download affordance and
 * pull inline (progress in the row). Replaces the old separate switch+select box
 * so local models live right inside the model dropdown.
 */
export function UnifiedModelPicker({
  cloudModels,
  cloudValue,
  cost,
  cloudFailed,
  onCloudOpen,
  onCloudSelect,
  launchVia,
  ollamaModel,
  onLaunchViaChange,
  onOllamaModelChange,
  placeholder,
}: {
  cloudModels: string[] | null;
  cloudValue: string;
  cost?: Record<string, AgentModelCost>;
  cloudFailed: boolean;
  onCloudOpen: () => void;
  onCloudSelect: (model: string) => void;
  launchVia: "direct" | "ollama";
  ollamaModel: string;
  onLaunchViaChange: (launchVia: "direct" | "ollama") => void;
  onOllamaModelChange: (model: string) => void;
  placeholder: string;
}) {
  const t = useTranslations("agents");
  const ollama = useOllama();
  const { status, pulling, pull, cancelPull } = ollama;
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const ready = Boolean(status?.installed && status.running && status.launchCapable);
  const installedModels = status?.models ?? [];
  const installedSet = new Set(installedModels.map((m) => m.name.replace(/:latest$/, "")));
  const catalogToPull = OLLAMA_MODEL_CATALOG.filter((m) => !installedSet.has(m.tag.replace(/:latest$/, "")));
  const local = launchVia === "ollama";

  const selectCloud = (model: string) => {
    onCloudSelect(model);
    onLaunchViaChange("direct");
    onOllamaModelChange("");
    setOpen(false);
  };
  const selectLocal = (name: string) => {
    onOllamaModelChange(name);
    onLaunchViaChange("ollama");
    setOpen(false);
  };
  const startPull = async (tag: string) => {
    try {
      await pull(tag); // keep the popover open; the row shows progress
      toast.success(t("local.pullDone", { model: tag }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("local.pullFailed", { model: tag }));
    }
  };

  const triggerLabel = local && ollamaModel ? ollamaModel : cloudValue || placeholder;

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) onCloudOpen();
        }}
      >
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="xs" className="max-w-64" title={triggerLabel}>
            {local && <BoltIcon className="size-3 text-primary" />}
            <span className={cn("truncate", local || cloudValue ? "font-mono" : "text-muted-foreground")}>
              {triggerLabel}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <Command>
            <CommandInput placeholder={t("searchModels")} />
            <CommandList className="max-h-80">
              <CommandEmpty>{cloudModels === null ? t("loadingModels") : t("noModelFound")}</CommandEmpty>

              {!cloudFailed && (cloudModels?.length ?? 0) > 0 && (
                <CommandGroup heading={t("local.cloudGroup")}>
                  {(cloudModels ?? []).map((model) => (
                    <CommandItem key={model} value={`cloud ${model}`} onSelect={() => selectCloud(model)}>
                      <div className="flex min-h-6 w-full items-center gap-2">
                        <Gutter>
                          {!local && cloudValue === model && <CheckIcon className="size-3.5 text-primary" />}
                        </Gutter>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">{model}</span>
                        <CostHint cost={cost?.[model]} />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandGroup heading={t("local.localGroup")}>
                {!ready ? (
                  <CommandItem value="ollama enable local models" onSelect={() => setDialogOpen(true)}>
                    <div className="flex min-h-6 w-full items-center gap-2">
                      <Gutter>
                        <BoltIcon className="size-3.5 text-primary" />
                      </Gutter>
                      <span className="text-primary text-xs">{t("local.enableCta")}</span>
                    </div>
                  </CommandItem>
                ) : (
                  <>
                    {installedModels.map((m) => (
                      <CommandItem key={m.name} value={`local ${m.name}`} onSelect={() => selectLocal(m.name)}>
                        <div className="flex min-h-6 w-full items-center gap-2">
                          <Gutter>
                            {local && ollamaModel === m.name ? (
                              <CheckIcon className="size-3.5 text-primary" />
                            ) : (
                              <span className="size-1.5 rounded-full bg-green-500" />
                            )}
                          </Gutter>
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">{m.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {formatBytes(m.size)}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                    {catalogToPull.map((m) => {
                      const progress = pulling[m.tag] ?? pulling[`${m.tag}:latest`];
                      const busy = Boolean(progress);
                      return (
                        <CommandItem
                          key={m.tag}
                          value={`local pull ${m.tag} ${m.label}`}
                          // Pulling shouldn't dismiss — let the row show progress.
                          onSelect={() => !busy && void startPull(m.tag)}
                          // Only grow into a two-line row while actually pulling;
                          // idle rows keep the same height as every other row.
                          className={cn(busy && "flex-col items-stretch gap-1")}
                        >
                          <div className="flex min-h-6 w-full items-center gap-2">
                            <Gutter>
                              {busy ? (
                                <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
                              ) : (
                                <DownloadIcon className="size-3.5 text-muted-foreground" />
                              )}
                            </Gutter>
                            <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
                              {m.tag}
                            </span>
                            {busy ? (
                              <button
                                type="button"
                                title={t("local.cancel")}
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void cancelPull(m.tag);
                                }}
                              >
                                <XIcon className="size-3.5" />
                              </button>
                            ) : (
                              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                {m.size} · {m.minRam}
                              </span>
                            )}
                          </div>
                          {busy && <PullProgressLine progress={progress} />}
                        </CommandItem>
                      );
                    })}
                    <CommandItem value="ollama manage models" onSelect={() => setDialogOpen(true)}>
                      <div className="flex min-h-6 w-full items-center gap-2">
                        <Gutter>
                          <Settings2Icon className="size-3.5 text-muted-foreground" />
                        </Gutter>
                        <span className="text-muted-foreground text-xs">{t("local.manageModels")}</span>
                      </div>
                    </CommandItem>
                  </>
                )}
              </CommandGroup>

              {cloudFailed && (
                <div className="p-2">
                  <Input
                    value={cloudValue}
                    onChange={(e) => selectCloud(e.target.value)}
                    placeholder={placeholder}
                    className="h-7 font-mono text-xs"
                  />
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <OllamaInstallDialog ollama={ollama} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

export { DaemonStatus };

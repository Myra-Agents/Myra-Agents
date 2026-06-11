"use client";

import { useState } from "react";

import {
  BoltIcon,
  CheckCircle2Icon,
  DownloadIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
  TrashIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { UseOllama } from "@/hooks/use-ollama";
import { openExternal } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { OllamaPullProgress } from "@/types/settings";
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
  const { status, pulling, pull, remove } = ollama;
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
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="ml-auto shrink-0"
                  disabled={isPulling(model.tag)}
                  onClick={() => void doPull(model.tag)}
                >
                  {isPulling(model.tag) ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <DownloadIcon className="size-3" />
                  )}
                  {t("local.pull")}
                </Button>
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

/**
 * The in-options control: a "use a local model" switch + the installed-model
 * picker, with the install dialog as the on-ramp. Drives `launchVia`/`ollamaModel`
 * on the owning preset. Rendered by {@link AgentOptions} only when the harness is
 * one Ollama can launch and the parent provides the change handlers.
 */
export function OllamaModelControl({
  ollama,
  enabled,
  model,
  onEnabledChange,
  onModelChange,
}: {
  ollama: UseOllama;
  enabled: boolean;
  model: string;
  onEnabledChange: (enabled: boolean) => void;
  onModelChange: (model: string) => void;
}) {
  const t = useTranslations("agents");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { status, loading } = ollama;
  const ready = Boolean(status?.installed && status.running && status.launchCapable);
  const models = status?.models ?? [];

  const toggle = (next: boolean) => {
    if (next && !ready) {
      // Not ready → run the on-ramp first; the switch flips on once a model is set.
      setDialogOpen(true);
      return;
    }
    onEnabledChange(next);
    // Default to the first installed model so the run isn't left without one.
    if (next && !model && models.length > 0) onModelChange(models[0].name);
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed bg-muted/30 p-2.5">
      <div className="flex items-center gap-2">
        <BoltIcon className="size-3.5 text-primary" />
        <span className="font-medium text-xs">{t("local.useLocal")}</span>
        {ready && (
          <Badge variant="outline" className="border-green-500/30 bg-green-500/10 px-1.5 text-[10px] text-green-600">
            {t("local.ollamaReady")}
          </Badge>
        )}
        <Switch className="ml-auto" checked={enabled && ready} disabled={loading} onCheckedChange={toggle} />
      </div>

      {enabled && ready && (
        <div className="flex flex-wrap items-center gap-2">
          {models.length > 0 ? (
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger size="sm" className="h-7 w-56 text-xs">
                <SelectValue placeholder={t("local.selectModel")} />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.name} value={m.name}>
                    <span className="font-mono text-xs">{m.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-[11px] text-muted-foreground">{t("local.noModelsYet")}</span>
          )}
          <Button type="button" variant="outline" size="xs" onClick={() => setDialogOpen(true)}>
            <DownloadIcon className="size-3" />
            {t("local.manageModels")}
          </Button>
        </div>
      )}

      {!ready && (
        <button
          type="button"
          className="text-[11px] text-primary underline-offset-2 hover:underline"
          onClick={() => setDialogOpen(true)}
        >
          {t("local.enableCta")}
        </button>
      )}

      <OllamaInstallDialog ollama={ollama} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

export { DaemonStatus };

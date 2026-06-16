"use client";

import { DownloadIcon, Loader2Icon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DaemonStatus, LocalModelManager } from "@/components/agents/ollama-local-models";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOllama } from "@/hooks/use-ollama";
import { openExternal } from "@/lib/tauri";
import { OLLAMA_INSTALL_INFO } from "@/types/settings";

/**
 * Settings → Local models. The control panel for the Ollama runtime: install /
 * start the daemon, then pull, browse and remove local models. Mirrors the
 * `useLocalServer` panel shape but for the (backend-agnostic) Ollama rpcs.
 */
export function LocalModelsPanel() {
  const t = useTranslations("agents");
  const ollama = useOllama();
  const { status, loading, busy, install, serve, refresh } = ollama;
  const ready = Boolean(status?.installed && status.running && status.launchCapable);

  const runInstall = async () => {
    try {
      await install();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("local.installFailed"));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("local.panelTitle")}</CardTitle>
        <Button variant="ghost" size="icon-xs" title={t("local.refresh")} onClick={() => void refresh()}>
          <RefreshCwIcon className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-xs">{t("local.panelDescription")}</p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-muted-foreground text-xs">
            <Loader2Icon className="size-3.5 animate-spin" />
            {t("local.checking")}
          </div>
        ) : (
          <>
            <DaemonStatus ollama={ollama} />

            {!status?.installed ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy} onClick={() => void runInstall()}>
                  {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <DownloadIcon className="size-3.5" />}
                  {t("local.installNow")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openExternal(OLLAMA_INSTALL_INFO.docsUrl)}
                >
                  {t("local.installManually")}
                </Button>
              </div>
            ) : !status.launchCapable ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void runInstall()}>
                  {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />}
                  {t("local.update")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openExternal(OLLAMA_INSTALL_INFO.docsUrl)}
                >
                  {t("local.openDownloads")}
                </Button>
              </div>
            ) : !status.running ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => void serve()}>
                {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlayIcon className="size-3.5" />}
                {t("local.startDaemon")}
              </Button>
            ) : null}

            {ready && <LocalModelManager ollama={ollama} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

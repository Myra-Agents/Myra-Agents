"use client";

import { serverUpdateState } from "@myra/shared";
import { ArrowUpCircleIcon, DownloadIcon, Loader2Icon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DaemonStatus, LocalModelManager } from "@/components/agents/ollama-local-models";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLatestOllamaVersion } from "@/hooks/use-latest-ollama-version";
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
  const { latest: latestVersion, refresh: refreshLatest } = useLatestOllamaVersion();
  const ready = Boolean(status?.installed && status.running && status.launchCapable);
  // `status.version` is the raw `ollama --version` line (e.g. "ollama version is
  // 0.30.10"), not a bare semver — pull the X.Y.Z out before comparing.
  const currentVersion = status?.version?.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? null;
  // Only flag an upgrade once Ollama is recent enough to be `launchCapable` — a
  // too-old install is already handled by its own "update required" branch below.
  const outdated =
    Boolean(status?.installed) &&
    status?.launchCapable === true &&
    serverUpdateState(currentVersion, latestVersion) === "outdated";

  const runInstall = async () => {
    try {
      await install();
      // Pick up the new version on the next "latest" comparison.
      void refreshLatest(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("local.installFailed"));
    }
  };

  const onRefresh = () => {
    void refresh();
    void refreshLatest(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("local.panelTitle")}</CardTitle>
        <Button variant="ghost" size="icon-xs" title={t("local.refresh")} onClick={onRefresh}>
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

            {outdated && (
              <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-amber-700 text-xs dark:text-amber-500">
                <div className="flex items-start gap-2">
                  <ArrowUpCircleIcon className="mt-px size-3.5 shrink-0" />
                  <span>
                    {t("local.updateAvailable", {
                      current: currentVersion ?? "?",
                      latest: latestVersion ?? "?",
                    })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pl-5.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openExternal(OLLAMA_INSTALL_INFO.docsUrl)}
                  >
                    {t("local.openDownloads")}
                  </Button>
                </div>
              </div>
            )}

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

"use client";

import { stripServerTag } from "@myra/shared";
import {
  ArrowUpCircleIcon,
  CheckCircle2Icon,
  HardDriveDownloadIcon,
  LockIcon,
  ServerIcon,
  TagIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocalServer } from "@/hooks/use-local-server";
import { cn } from "@/lib/utils";

/**
 * Settings → Connections → Local Server (desktop). Installs `myra-server` on this
 * computer as a persistent per-user service and talks to it directly over
 * localhost — no hub, no internet. Until set up, the app runs a throwaway
 * sidecar for the session; "Set up" promotes it to a login service on a fixed
 * port, secured with a local token. Remote Access (below) layers the hub on top.
 * Rendered only when `isTauri()`.
 */
export function LocalServerPanel() {
  const t = useTranslations("settings.connections.localServer");
  const { status, loading, busy, updateAvailable, install, uninstall } = useLocalServer();

  const installed = status?.installed === true;
  const running = status?.running === true;

  const handleInstall = async () => {
    try {
      await install();
      toast.success(t("setupDone"));
    } catch {
      toast.error(t("setupFailed"));
    }
  };

  const handleUninstall = async () => {
    try {
      await uninstall();
      toast.success(t("removed"));
    } catch {
      toast.error(t("removeFailed"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ServerIcon className="size-4 text-muted-foreground" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{t("description")}</p>

        <div className="flex items-center gap-2 rounded-md border p-3">
          {installed ? (
            <CheckCircle2Icon className={cn("size-4 shrink-0", running ? "text-green-500" : "text-muted-foreground")} />
          ) : (
            <ServerIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 text-sm">
            {installed ? (
              <p className={running ? "text-foreground" : "text-muted-foreground"}>
                {running
                  ? t("installedRunning", { port: status?.port ?? 0 })
                  : t("installedStopped", { version: status?.version ?? "?" })}
              </p>
            ) : (
              <p className="text-muted-foreground">{t("notInstalled")}</p>
            )}
            <p className="mt-0.5 flex items-center gap-1 text-muted-foreground text-xs">
              <TagIcon className="size-3" />
              {t("serverVersion", { version: stripServerTag(status?.version ?? status?.embeddedVersion ?? "?") })}
            </p>
            {installed && (
              <p className="mt-0.5 flex items-center gap-1 text-muted-foreground text-xs">
                <LockIcon className="size-3" />
                {t("secured")}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!installed ? (
            <Button size="sm" disabled={busy || loading} onClick={handleInstall}>
              <HardDriveDownloadIcon className="size-3" />
              {t("setUp")}
            </Button>
          ) : (
            <>
              {updateAvailable && (
                <Button size="sm" disabled={busy || loading} onClick={handleInstall}>
                  <ArrowUpCircleIcon className="size-3" />
                  {t("update", { version: status?.embeddedVersion ?? "" })}
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={busy || loading} onClick={handleUninstall}>
                {t("uninstall")}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { ArrowUpCircleIcon, CheckCircle2Icon, DownloadIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAppUpdate } from "@/hooks/use-app-update";
import { isTauri } from "@/lib/tauri";

/**
 * Settings → Preferences → App updates (desktop). Reports this build's version,
 * lets the user check GitHub Releases for a newer *signed* build, and installs +
 * relaunches into it in place. Powered by Tauri's updater plugin via
 * `useAppUpdate`. Rendered only under Tauri (`isTauri()`), so it's absent in the
 * plain-browser dev backend.
 */
export function AppUpdatePanel() {
  const t = useTranslations("settings.preferences.appUpdate");
  const {
    currentVersion,
    available,
    newVersion,
    checking,
    downloading,
    progress,
    checkedOnce,
    check,
    installAndRelaunch,
  } = useAppUpdate();

  // No self-update outside the desktop shell.
  if (!isTauri()) return null;

  const handleCheck = async () => {
    const found = await check();
    if (!found) toast.success(t("upToDate"));
  };

  const handleInstall = async () => {
    try {
      await installAndRelaunch();
    } catch {
      toast.error(t("installFailed"));
    }
  };

  const pct = progress === null ? null : Math.round(progress * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowUpCircleIcon className="size-4 text-muted-foreground" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{t("description")}</p>

        <div className="flex items-center gap-2 rounded-md border p-3">
          {available ? (
            <ArrowUpCircleIcon className="size-4 shrink-0 text-primary" />
          ) : (
            <CheckCircle2Icon className="size-4 shrink-0 text-green-500" />
          )}
          <div className="min-w-0 text-sm">
            {available ? (
              <p className="text-foreground">{t("available", { version: newVersion ?? "" })}</p>
            ) : (
              <p className="text-muted-foreground">
                {checkedOnce ? t("upToDate") : t("current", { version: currentVersion ?? "?" })}
              </p>
            )}
            <p className="mt-0.5 text-muted-foreground text-xs">{t("current", { version: currentVersion ?? "?" })}</p>
          </div>
        </div>

        {downloading && (
          <div className="space-y-1">
            <Progress value={pct ?? undefined} />
            <p className="text-muted-foreground text-xs">
              {pct === null ? t("installing") : t("installingPct", { pct })}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {available ? (
            <Button size="sm" disabled={downloading} onClick={handleInstall}>
              {downloading ? <Loader2Icon className="size-3 animate-spin" /> : <DownloadIcon className="size-3" />}
              {t("install")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={checking || downloading} onClick={handleCheck}>
              {checking ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
              {checking ? t("checking") : t("check")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

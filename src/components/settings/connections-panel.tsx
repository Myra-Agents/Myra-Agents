"use client";

import { useEffect, useState } from "react";

import { serverUpdateState } from "@myra/shared";
import { CheckCircle2Icon, CircleIcon, RefreshCwIcon, ServerIcon, TrashIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConnections } from "@/hooks/use-connections";
import { useLatestServerVersion } from "@/hooks/use-latest-server-version";
import { useServerVersions } from "@/hooks/use-server-versions";
import type { ConnectionStatus } from "@/lib/connections/types";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "text-green-500",
  connecting: "text-amber-500",
  error: "text-destructive",
  disabled: "text-muted-foreground",
};

/** Chip color per "is this server current?" state (`unknown` renders no chip). */
const VERSION_BADGE: Record<"current" | "outdated" | "ahead", string> = {
  current: "bg-green-500/10 text-green-600 dark:text-green-400",
  outdated: "bg-amber-500/10 text-amber-600 dark:text-amber-500",
  ahead: "bg-muted text-muted-foreground",
};

/**
 * Settings → Connections. Lists every backend the aggregated board talks to and
 * toggles per-server board visibility. The local connection is permanent.
 *
 * User connection disabled — the "add remote connection" form, the account
 * sign-in/out row and the managed-hub section (pairing + instances) were removed.
 * Restore them from git history to bring back remote/hub backends.
 */
export function ConnectionsPanel() {
  const t = useTranslations("settings.connections");
  const { connections, primaryId, remove, setPrimary, refresh, toggleVisible, isVisible } = useConnections();
  const versions = useServerVersions();
  const { latest, refresh: refreshLatest } = useLatestServerVersion();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Force a latest-release re-check (bypass the 6h cache) alongside the
      // connection refresh, so a manual click can't leave a stale badge.
      await Promise.all([refresh(), refreshLatest(true)]);
    } finally {
      setRefreshing(false);
    }
  };

  // Poll every 30s while the panel is open so statuses, reported versions and
  // the update badge stay live without a manual click. The latest-release check
  // honors its own 6h cache (won't blow GitHub's 60 req/hr limit); only the
  // connection refresh actually runs every tick. Pause while the window is
  // hidden (e.g. minimized to the tray) to avoid needless work.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
      void refreshLatest();
    };
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [refresh, refreshLatest]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ServerIcon className="size-4 text-muted-foreground" />
          {t("title")}
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          title={t("refresh")}
        >
          <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
          {t("refresh")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{t("description")}</p>

        <div className="space-y-2">
          {connections.map((conn) => {
            const isPrimary = conn.id === primaryId;
            const visible = isVisible(conn.id);
            const isLocal = conn.id === "local";
            const version = versions[conn.id];
            const vstate = serverUpdateState(version, latest);
            return (
              <div key={conn.id} className="flex items-center gap-2 rounded-md border p-3">
                <CircleIcon className={cn("size-3 shrink-0 fill-current", STATUS_COLOR[conn.status])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-sm">{conn.label}</span>
                    {isPrimary && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-[10px] text-primary">
                        {t("primary")}
                      </span>
                    )}
                  </div>
                  <p className="truncate font-mono text-muted-foreground text-xs">
                    {conn.baseUrl || t("inProcess")} · {t(`status.${conn.status}`)}
                    {version && ` · v${version}`}
                  </p>
                  {version && vstate !== "unknown" && (
                    <span
                      className={cn(
                        "mt-1 inline-block rounded px-1.5 py-0.5 font-medium text-[10px]",
                        VERSION_BADGE[vstate],
                      )}
                      title={
                        vstate === "outdated"
                          ? t("version.outdatedHint", { latest: latest ?? "" })
                          : vstate === "ahead"
                            ? t("version.aheadHint", { latest: latest ?? "" })
                            : undefined
                      }
                    >
                      {t(`version.${vstate}`)}
                    </span>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleVisible(conn.id)}
                  title={visible ? t("hide") : t("show")}
                >
                  {visible ? t("visible") : t("hidden")}
                </Button>

                {!isPrimary && (
                  <Button variant="ghost" size="sm" onClick={() => setPrimary(conn.id)} title={t("makePrimary")}>
                    <CheckCircle2Icon className="size-3.5" />
                  </Button>
                )}

                {!isLocal && (
                  <Button variant="ghost" size="icon-xs" onClick={() => remove(conn.id)} title={t("remove")}>
                    <TrashIcon />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

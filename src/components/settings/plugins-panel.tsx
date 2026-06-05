"use client";

import { useCallback, useEffect, useState } from "react";

import { BlocksIcon, BotIcon, RadioIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { connectionManager } from "@/lib/connections/manager";
import { isDevModeError } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { PluginInfo } from "@/types/settings";

/**
 * Settings → Plugins. Lists every plugin installed under
 * `~/.myra-agents/plugins/` (via the `list_plugins` rpc) and lets the user
 * switch each on/off. The toggle is keyed on the plugin's folder name and feeds
 * `AppSettings.disabledPlugins` — the actual persistence happens when the
 * parent settings page is saved, so this reflects the unsaved `disabledPlugins`
 * draft, not the server's own enabled flag.
 */
export function PluginsPanel({
  disabledPlugins,
  onToggle,
}: {
  disabledPlugins: string[];
  onToggle: (name: string, enabled: boolean) => void;
}) {
  const t = useTranslations("settings.plugins");
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const id = connectionManager.primaryId();
    try {
      setError(null);
      const data = await connectionManager.invokeOne<PluginInfo[]>(id, "list_plugins");
      setPlugins(data);
    } catch (e) {
      // Browser dev mode has no sidecar — show the empty state, not an error.
      if (isDevModeError(e)) {
        setPlugins([]);
        return;
      }
      console.error("Failed to load plugins:", e);
      setError(String(e));
      setPlugins([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const off = connectionManager.onTopologyChange(() => void load());
    return off;
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-destructive text-sm">{error}</p>}

        {plugins !== null && plugins.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <BlocksIcon className="size-8 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          </div>
        )}

        {plugins?.map((plugin) => {
          const enabled = !disabledPlugins.includes(plugin.name);
          return (
            <div key={plugin.name} className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-sm">{plugin.manifestName ?? plugin.name}</span>
                  {plugin.version && <span className="text-muted-foreground text-xs">v{plugin.version}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {plugin.roles.includes("agent") && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                      <BotIcon className="size-3" />
                      {t("role.agent", {
                        count: plugin.providesAgents.length,
                        agents: plugin.providesAgents.map((a) => a.name).join(", "),
                      })}
                    </span>
                  )}
                  {plugin.roles.includes("event") && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                      <RadioIcon className="size-3" />
                      {t("role.event", { events: plugin.subscribes.join(", ") })}
                    </span>
                  )}
                </div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(checked) => onToggle(plugin.name, checked)}
                aria-label={t("toggleAria", { name: plugin.manifestName ?? plugin.name })}
                className={cn(!enabled && "opacity-80")}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

import { BlocksIcon, BotIcon, ChevronDownIcon, PuzzleIcon, RadioIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { connectionManager } from "@/lib/connections/manager";
import { isDevModeError } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { PluginInfo } from "@/types/settings";

/**
 * The buckets the Plugins panel groups by, in display order. A plugin lands in a
 * group for every role it declares (`agent` and/or `event`), so a dual-role
 * plugin appears under both — the toggle stays in sync because every row keys on
 * the same `plugin.name`. Anything with no known role falls into `other`.
 */
const PLUGIN_GROUPS = ["agent", "event", "other"] as const;
type PluginGroup = (typeof PLUGIN_GROUPS)[number];

const GROUP_ICON: Record<PluginGroup, typeof BotIcon> = {
  agent: BotIcon,
  event: RadioIcon,
  other: PuzzleIcon,
};

function groupsFor(plugin: PluginInfo): PluginGroup[] {
  const groups = PLUGIN_GROUPS.filter((g) => g !== "other" && plugin.roles.includes(g));
  return groups.length > 0 ? groups : ["other"];
}

/**
 * Settings → Plugins. Lists every plugin installed under
 * `~/.myra-agents/plugins/` (via the `list_plugins` rpc) and lets the user
 * switch each on/off. The toggle is keyed on the plugin's folder name and feeds
 * `AppSettings.disabledPlugins` — the actual persistence happens when the
 * parent settings page is saved, so this reflects the unsaved `disabledPlugins`
 * draft, not the server's own enabled flag.
 *
 * Plugins are grouped by type (agent / event / other) into collapsible
 * sections, each open by default.
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

  const renderRow = (plugin: PluginInfo) => {
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
  };

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

        {PLUGIN_GROUPS.map((group) => {
          const members = plugins?.filter((p) => groupsFor(p).includes(group)) ?? [];
          if (members.length === 0) return null;
          const GroupIcon = GROUP_ICON[group];
          return (
            <Collapsible key={group} defaultOpen className="rounded-lg border">
              <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left font-medium text-sm">
                <GroupIcon className="size-4 text-muted-foreground" />
                <span>{t(`group.${group}`)}</span>
                <span className="text-muted-foreground text-xs">{members.length}</span>
                <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 px-3 pb-3">{members.map(renderRow)}</CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}

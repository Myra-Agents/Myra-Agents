"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { COLUMN_CONFIG } from "@myra/shared/types/kanban";
import { BlocksIcon, PencilIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useConnections } from "@/hooks/use-connections";
import { connectionManager } from "@/lib/connections/manager";
import { aggregateInstances, deployInstance, removeInstance } from "@/lib/integrations/deploy";
import { isDevModeError } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { PluginInfo, PluginInstance } from "@/types/settings";

import { ConnectWizard, type WizardEditTarget } from "./connect-wizard";

function eventLabel(status: string): string {
  return COLUMN_CONFIG[status as keyof typeof COLUMN_CONFIG]?.label ?? status.replace(/_/g, " ");
}

/**
 * Settings → Integrations. The card gallery: one card per configured instance
 * (label, source plugin, status, the events it fires on, and which machines it's
 * deployed to), a "+ New" tile, and the {@link ConnectWizard} for create/edit.
 * State is aggregated across every connection — an instance "is on" a machine iff
 * that machine's settings carry its id.
 */
export function IntegrationsPanel() {
  const t = useTranslations("settings.integrations");
  const { connections } = useConnections();
  const [catalog, setCatalog] = useState<PluginInfo[]>([]);
  const [instances, setInstances] = useState<Record<string, PluginInstance>>({});
  const [membership, setMembership] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<WizardEditTarget | undefined>(undefined);

  const connById = useMemo(() => new Map(connections.map((c) => [c.id, c])), [connections]);

  const load = useCallback(async () => {
    const connIds = connections.map((c) => c.id);
    try {
      const primary = connectionManager.primaryId();
      const cat = await connectionManager.invokeOne<PluginInfo[]>(primary, "list_plugins").catch(() => []);
      setCatalog(cat);
      const agg = await aggregateInstances(connIds);
      setInstances(agg.instances);
      setMembership(agg.membership);
    } catch (e) {
      if (!isDevModeError(e)) console.error("Failed to load integrations:", e);
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [connections]);

  useEffect(() => {
    void load();
    const off = connectionManager.onTopologyChange(() => void load());
    return off;
  }, [load]);

  const pluginFor = useCallback((name: string) => catalog.find((p) => p.name === name), [catalog]);
  const secretKeysFor = useCallback(
    (name: string) => (pluginFor(name)?.config ?? []).filter((f) => f.type === "secret").map((f) => f.key),
    [pluginFor],
  );

  const openNew = () => {
    setEditing(undefined);
    setWizardOpen(true);
  };

  const openEdit = useCallback(
    async (instance: PluginInstance) => {
      const connIds = membership[instance.id] ?? [];
      // Secret status (names only) from any machine the instance already runs on.
      let secretKeys: string[] = [];
      if (connIds[0]) {
        secretKeys = await connectionManager
          .invokeOne<string[]>(connIds[0], "plugin_secret_status", { plugin: instance.id })
          .catch(() => []);
      }
      setEditing({ instance, connIds, secretKeys });
      setWizardOpen(true);
    },
    [membership],
  );

  const toggleEnabled = useCallback(
    async (instance: PluginInstance, enabled: boolean) => {
      const connIds = membership[instance.id] ?? [];
      const next = { ...instance, enabled };
      // Re-write to the same machines (no add/remove), secrets untouched.
      await deployInstance({
        instance: next,
        secrets: [],
        selectedConnIds: connIds,
        allConnIds: connIds,
        secretKeys: [],
      });
      setInstances((m) => ({ ...m, [instance.id]: next }));
    },
    [membership],
  );

  const remove = useCallback(
    async (instance: PluginInstance) => {
      if (!window.confirm(t("deleteConfirm", { label: instance.label }))) return;
      const allConnIds = connections.map((c) => c.id);
      const results = await removeInstance({
        instanceId: instance.id,
        allConnIds,
        secretKeys: secretKeysFor(instance.plugin),
      });
      if (results.some((r) => !r.ok)) toast.error(t("deletePartial"));
      void load();
    },
    [connections, secretKeysFor, load, t],
  );

  const list = Object.values(instances);
  const anyWebhooks = catalog.some((p) => p.webhooks?.length);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        <Button size="sm" onClick={openNew}>
          <PlusIcon className="size-3.5" />
          {t("new")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {anyWebhooks && (
          <Alert>
            <TriangleAlertIcon className="size-4" />
            <AlertTitle>{t("webhookWarning.title")}</AlertTitle>
            <AlertDescription>{t("webhookWarning.body")}</AlertDescription>
          </Alert>
        )}

        {!loading && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <BlocksIcon className="size-8 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
            <Button variant="outline" size="sm" onClick={openNew}>
              <PlusIcon className="size-3.5" />
              {t("new")}
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((inst) => {
            const machines = membership[inst.id] ?? [];
            const plugin = pluginFor(inst.plugin);
            const out = plugin?.webhooks?.find((w) => w.direction === "out");
            const events = inst.events && inst.events.length > 0 ? inst.events : (out?.events ?? []);
            const deployed = machines.length > 0;
            return (
              <div key={inst.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          !inst.enabled ? "bg-muted-foreground/40" : deployed ? "bg-green-500" : "bg-amber-500",
                        )}
                      />
                      <span className="truncate font-medium text-sm">{inst.label}</span>
                    </div>
                    <span className="text-muted-foreground text-xs">{plugin?.manifestName ?? inst.plugin}</span>
                  </div>
                  <Switch
                    checked={inst.enabled}
                    onCheckedChange={(c) => void toggleEnabled(inst, c)}
                    aria-label={t("toggleAria", { label: inst.label })}
                  />
                </div>

                <p className="text-muted-foreground text-xs">
                  {events.length > 0 ? t("firesOn", { events: events.map(eventLabel).join(", ") }) : t("noTriggers")}
                </p>

                <div className="flex flex-wrap gap-1">
                  {machines.length === 0 ? (
                    <Badge variant="outline" className="text-amber-600">
                      {t("noMachines")}
                    </Badge>
                  ) : (
                    machines.map((connId) => (
                      <Badge key={connId} variant="secondary">
                        {connById.get(connId)?.label ?? connId}
                      </Badge>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-end gap-1 border-t pt-2">
                  <Button variant="ghost" size="sm" onClick={() => void openEdit(inst)}>
                    <PencilIcon className="size-3.5" />
                    {t("edit")}
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => void remove(inst)} aria-label={t("delete")}>
                    <Trash2Icon className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={openNew}
            className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PlusIcon className="size-5" />
            <span className="text-sm">{t("new")}</span>
          </button>
        </div>
      </CardContent>

      {wizardOpen && (
        <ConnectWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          plugins={catalog}
          connections={connections}
          editing={editing}
          onDeployed={() => void load()}
        />
      )}
    </Card>
  );
}

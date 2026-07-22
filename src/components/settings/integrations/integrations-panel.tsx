"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { COLUMN_CONFIG } from "@myra/shared/types/kanban";
import {
  BlocksIcon,
  PlayIcon,
  PlugZapIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserIcon,
  ZapIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/hooks/use-confirm";
import { useConnections } from "@/hooks/use-connections";
import { connectionManager } from "@/lib/connections/manager";
import { aggregateInstances, deployInstance, removeInstance } from "@/lib/integrations/deploy";
import { track } from "@/lib/posthog/events";
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
  const { confirm, confirmDialog } = useConfirm();
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

  // The connected account label per instance ("@user · Name"), fetched from a
  // connector that exposes an `identity` options field (e.g. GitLab's GET /user).
  // Connectors without one just show a plain "Connected".
  const [identities, setIdentities] = useState<Record<string, string>>({});
  // The single source of truth for "is this instance connected". Set true on a
  // successful identity fetch or a completed sign-in; set false explicitly on
  // disconnect. Never inferred from transient connect progress, so a disconnect
  // can't be misread as "Connected".
  const [connectedIds, setConnectedIds] = useState<Record<string, boolean>>({});
  const setConnected = useCallback(
    (id: string, value: boolean) => setConnectedIds((s) => (s[id] === value ? s : { ...s, [id]: value })),
    [],
  );
  // Per-instance generation counter — bumped whenever the connection changes
  // (sign-in / disconnect). An identity fetch captures the generation when it
  // starts and discards its result if the generation changed meanwhile, so a
  // slow in-flight fetch from a just-ended connection can't revive "Connected".
  const genRef = useRef<Record<string, number>>({});
  const bumpGen = useCallback((id: string) => {
    genRef.current[id] = (genRef.current[id] ?? 0) + 1;
  }, []);

  // Fetch one instance's connected account. `retries` backs off and re-tries on
  // error — right after a sign-in the token may not be queryable yet, so a fresh
  // connection resolves without waiting for a manual page refresh.
  const fetchIdentity = useCallback(
    async (inst: PluginInstance, retries = 0) => {
      const plugin = catalog.find((p) => p.name === inst.plugin);
      if (!plugin?.optionsExec) return;
      const gen = genRef.current[inst.id] ?? 0;
      const primary = connectionManager.primaryId();
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await connectionManager.invokeOne<{ options?: { value: string; label: string }[] }>(
            primary,
            "connector_options",
            { connector: inst.plugin, field: "identity" },
          );
          if (genRef.current[inst.id] !== gen) return; // connection changed mid-fetch — discard
          const label = res?.options?.[0]?.label;
          if (label) {
            setIdentities((s) => (s[inst.id] === label ? s : { ...s, [inst.id]: label }));
            setConnected(inst.id, true);
          }
          return; // resolved (connected, or genuinely not) — stop
        } catch {
          if (genRef.current[inst.id] !== gen) return; // aborted by a connection change
          if (attempt < retries) await new Promise((r) => setTimeout(r, 800));
        }
      }
    },
    [catalog, setConnected],
  );

  useEffect(() => {
    for (const inst of Object.values(instances)) void fetchIdentity(inst);
  }, [instances, fetchIdentity]);

  // Refs so the bus-listener effect (below) can call the latest versions without
  // re-subscribing on every render.
  const fetchIdentityRef = useRef(fetchIdentity);
  fetchIdentityRef.current = fetchIdentity;
  const instancesRef = useRef(instances);
  instancesRef.current = instances;

  // Connect (`run_plugin_setup`) progress per instance id — a plugin's `catalog
  // .setup` (OAuth consent, etc.) runs server-side and streams back over the
  // bus; see PROTOCOL.md's "Role 5". `running` clears on `plugin-setup-done`.
  const [connectState, setConnectState] = useState<
    Record<string, { lines: string[]; running: boolean; ok?: boolean }>
  >({});
  // Instances whose in-flight `run_plugin_setup` is a disconnect, not a connect —
  // both emit `plugin-setup-done {ok:true}`, but a disconnect must reset to the
  // Sign-in state, not show "Connected".
  const disconnectingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let unlistenLog: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;
    void connectionManager
      .listenAll<{ id: string; line: string }>("plugin-setup-log", ({ payload }) => {
        setConnectState((s) => {
          const cur = s[payload.id] ?? { lines: [], running: true };
          return { ...s, [payload.id]: { ...cur, lines: [...cur.lines, payload.line].slice(-20) } };
        });
      })
      .then((un) => {
        unlistenLog = un;
      });
    void connectionManager
      .listenAll<{ id: string; ok: boolean }>("plugin-setup-done", ({ payload }) => {
        if (disconnectingRef.current.has(payload.id)) {
          // Disconnect finished — mark not-connected, drop the progress state and
          // the shown account; never render "Connected".
          disconnectingRef.current.delete(payload.id);
          genRef.current[payload.id] = (genRef.current[payload.id] ?? 0) + 1;
          setConnectedIds((s) => ({ ...s, [payload.id]: false }));
          setConnectState((s) => {
            const { [payload.id]: _, ...rest } = s;
            return rest;
          });
          setIdentities((s) => {
            const { [payload.id]: _, ...rest } = s;
            return rest;
          });
          void load();
          return;
        }
        setConnectState((s) => ({
          ...s,
          [payload.id]: { lines: s[payload.id]?.lines ?? [], running: false, ok: payload.ok },
        }));
        if (payload.ok) {
          // New generation for this fresh connection; the identity fetch below
          // captures it, so a later disconnect invalidates it.
          genRef.current[payload.id] = (genRef.current[payload.id] ?? 0) + 1;
          setConnectedIds((s) => ({ ...s, [payload.id]: true }));
          void load();
          // Pull the account right away (retrying while the token settles) so the
          // card flips to "Connected as …" without waiting for a manual refresh.
          const inst = instancesRef.current[payload.id];
          if (inst) void fetchIdentityRef.current(inst, 5);
        }
      })
      .then((un) => {
        unlistenDone = un;
      });
    return () => {
      unlistenLog?.();
      unlistenDone?.();
    };
  }, [load]);

  const startDisconnect = useCallback(
    async (instance: PluginInstance) => {
      const connId = (membership[instance.id] ?? [])[0];
      // FORCE the UI first, unconditionally: not-connected + no account + no
      // stale progress. The card flips to Sign-in the instant Disconnect is
      // clicked — no early return, no dependence on bus events. The generation
      // bump discards any in-flight identity fetch from the prior sign-in.
      disconnectingRef.current.add(instance.id);
      bumpGen(instance.id);
      setConnected(instance.id, false);
      setConnectState((s) => {
        const { [instance.id]: _, ...rest } = s;
        return rest;
      });
      setIdentities((s) => {
        const { [instance.id]: _, ...rest } = s;
        return rest;
      });
      // Best-effort backend clear (fall back to the primary machine when the
      // membership map hasn't loaded). UI stays disconnected regardless.
      const target = connId ?? connectionManager.primaryId();
      try {
        await connectionManager.invokeOne(target, "run_plugin_setup", {
          instanceId: instance.id,
          action: "disconnect",
        });
        track("integration_disconnect_started", { plugin: instance.plugin });
      } catch {
        // token may already be gone / machine offline — the UI is authoritative
      }
      // Safety valve: don't rely on plugin-setup-done. Clear the disconnecting
      // flag ourselves and re-probe the source of truth once — if genuinely
      // disconnected the probe fails and the card stays on Sign-in.
      setTimeout(() => {
        disconnectingRef.current.delete(instance.id);
        void fetchIdentityRef.current(instance);
      }, 1500);
    },
    [membership, setConnected, bumpGen],
  );

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
      if (!(await confirm({ description: t("deleteConfirm", { label: instance.label }) }))) return;
      // Log out first so the OAuth credential doesn't linger in the connector's
      // keychain after the instance is gone.
      const connId = (membership[instance.id] ?? [])[0];
      const plugin = catalog.find((p) => p.name === instance.plugin);
      if (connId && plugin?.catalog?.disconnect) {
        disconnectingRef.current.add(instance.id);
        await connectionManager
          .invokeOne(connId, "run_plugin_setup", { instanceId: instance.id, action: "disconnect" })
          .catch(() => {});
      }
      const allConnIds = connections.map((c) => c.id);
      const results = await removeInstance({
        instanceId: instance.id,
        allConnIds,
        secretKeys: secretKeysFor(instance.plugin),
      });
      if (results.some((r) => !r.ok)) toast.error(t("deletePartial"));
      track("integration_removed", { plugin: instance.plugin });
      void load();
    },
    [connections, secretKeysFor, load, t, confirm, membership, catalog],
  );

  const list = Object.values(instances);
  const anyWebhooks = catalog.some((p) => p.webhooks?.length);

  // Instances of the same connector connected to the SAME account (same fetched
  // identity) — flagged so the user notices a redundant duplicate.
  const duplicateAccountIds = useMemo(() => {
    const byAccount = new Map<string, string[]>();
    for (const inst of Object.values(instances)) {
      const id = identities[inst.id];
      if (!id) continue;
      const key = `${inst.plugin} ${id}`;
      byAccount.set(key, [...(byAccount.get(key) ?? []), inst.id]);
    }
    const dups = new Set<string>();
    for (const ids of byAccount.values()) if (ids.length > 1) ids.forEach((i) => dups.add(i));
    return dups;
  }, [instances, identities]);

  return (
    <Card>
      {confirmDialog}
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
            // `connected` is the explicit connectedIds signal; the @account name
            // fills in once the identity fetch resolves.
            const account = identities[inst.id];
            const connected = connectedIds[inst.id] === true;
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

                {(() => {
                  const cat = plugin?.catalog;
                  const canTrigger = cat?.verbs?.includes("trigger");
                  const triggerKinds = cat?.trigger?.config?.find((f) => f.type === "multiselect")?.options ?? [];
                  const catalogActions = cat?.actions ?? [];
                  if (canTrigger || catalogActions.length > 0) {
                    return (
                      <div className="flex flex-col gap-1.5">
                        {canTrigger && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="mr-0.5 text-[11px] text-muted-foreground uppercase tracking-wide">
                              {t("capabilities.triggers")}
                            </span>
                            {(triggerKinds.length > 0 ? triggerKinds : [cat?.trigger?.summary ?? ""]).map((k) => (
                              <Badge key={k} variant="outline" className="gap-1 font-normal">
                                <ZapIcon className="size-3 text-muted-foreground" />
                                {k}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {catalogActions.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="mr-0.5 text-[11px] text-muted-foreground uppercase tracking-wide">
                              {t("capabilities.actions")}
                            </span>
                            {catalogActions.map((a) => (
                              <Badge key={a.id} variant="outline" className="gap-1 font-normal">
                                <PlayIcon className="size-3 text-muted-foreground" />
                                {a.label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <p className="text-muted-foreground text-xs">
                      {events.length > 0
                        ? t("firesOn", { events: events.map(eventLabel).join(", ") })
                        : t("noTriggers")}
                    </p>
                  );
                })()}

                {connected && (
                  <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <UserIcon className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {account ? t("connectedAs", { account }) : t("connected")}
                      </span>
                    </span>
                    {plugin?.catalog?.disconnect && (
                      <button
                        type="button"
                        onClick={() => void startDisconnect(inst)}
                        disabled={connectState[inst.id]?.running}
                        className="shrink-0 text-destructive hover:underline disabled:opacity-50"
                      >
                        {plugin.catalog.disconnect.label || t("disconnect")}
                      </button>
                    )}
                  </div>
                )}

                {duplicateAccountIds.has(inst.id) && (
                  <div className="flex items-start gap-1.5 text-amber-600 text-xs">
                    <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                    <span>{t("sameAccount")}</span>
                  </div>
                )}

                {/* Machine badges only matter across multiple machines; with a
                    single local server it's redundant. Always surface the
                    "not deployed anywhere" warning, though. */}
                {(connections.length > 1 || machines.length === 0) && (
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
                )}

                {/* Sign in only when not already connected — use Disconnect
                    instead. Opens the wizard at its Configure step, where the
                    Sign-in itself runs. */}
                {plugin?.catalog?.setup && deployed && !connected && (
                  <div className="border-t pt-2">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => void openEdit(inst)}>
                      <PlugZapIcon className="size-3.5" />
                      {plugin.catalog.setup.label}
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-end gap-1 border-t pt-2">
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
          existingLabels={Object.values(instances)
            .filter((i) => i.id !== editing?.instance.id)
            .map((i) => i.label)}
          onDeployed={() => void load()}
        />
      )}
    </Card>
  );
}


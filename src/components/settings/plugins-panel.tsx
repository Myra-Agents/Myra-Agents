"use client";

import { useCallback, useEffect, useState } from "react";

import {
  BlocksIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  PuzzleIcon,
  RadioIcon,
  TriangleAlertIcon,
  WebhookIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { connectionManager } from "@/lib/connections/manager";
import { isDevModeError } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { PluginConfigField, PluginInfo } from "@/types/settings";

/**
 * The buckets the Plugins panel groups by, in display order. A plugin lands in a
 * group for every role it declares (`agent`, `event`, and/or `webhook`), so a
 * multi-role plugin appears under each. Anything with no known role falls into
 * `other`.
 */
const PLUGIN_GROUPS = ["agent", "event", "webhook", "other"] as const;
type PluginGroup = (typeof PLUGIN_GROUPS)[number];

const GROUP_ICON: Record<PluginGroup, typeof BotIcon> = {
  agent: BotIcon,
  event: RadioIcon,
  webhook: WebhookIcon,
  other: PuzzleIcon,
};

function groupsFor(plugin: PluginInfo): PluginGroup[] {
  const groups = PLUGIN_GROUPS.filter((g) => g !== "other" && plugin.roles.includes(g as PluginInfo["roles"][number]));
  return groups.length > 0 ? groups : ["other"];
}

/** The sidecar base URL for building inbound webhook URLs; "" (in-process) → the default local port. */
function serverBase(): string {
  try {
    const base = connectionManager.primary().connection.baseUrl;
    return base || "http://127.0.0.1:4319";
  } catch {
    return "http://127.0.0.1:4319";
  }
}

/**
 * Settings → Plugins. Lists every installed plugin (via `list_plugins`), lets the
 * user switch each on/off, fill in its declared `config` (secrets land in the OS
 * keychain via dedicated rpcs; the rest in the saved `pluginConfig` draft), and —
 * for plugins that declare `webhooks` — shows the inbound URL plus an always-on
 * caveat banner.
 */
export function PluginsPanel({
  disabledPlugins,
  pluginConfig,
  onToggle,
  onConfigChange,
}: {
  disabledPlugins: string[];
  pluginConfig: Record<string, Record<string, string | number | boolean>>;
  onToggle: (name: string, enabled: boolean) => void;
  onConfigChange: (plugin: string, key: string, value: string | number | boolean) => void;
}) {
  const t = useTranslations("settings.plugins");
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // pluginName → set secret keys (names only, from plugin_secret_status).
  const [secretStatus, setSecretStatus] = useState<Record<string, string[]>>({});

  const loadSecretStatus = useCallback(async (list: PluginInfo[]) => {
    const id = connectionManager.primaryId();
    const withSecrets = list.filter((p) => p.config?.some((f) => f.type === "secret"));
    const entries = await Promise.all(
      withSecrets.map(async (p) => {
        try {
          const keys = await connectionManager.invokeOne<string[]>(id, "plugin_secret_status", { plugin: p.name });
          return [p.name, keys] as const;
        } catch {
          return [p.name, []] as const;
        }
      }),
    );
    setSecretStatus(Object.fromEntries(entries));
  }, []);

  const load = useCallback(async () => {
    const id = connectionManager.primaryId();
    try {
      setError(null);
      const data = await connectionManager.invokeOne<PluginInfo[]>(id, "list_plugins");
      setPlugins(data);
      void loadSecretStatus(data);
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
  }, [loadSecretStatus]);

  useEffect(() => {
    void load();
    const off = connectionManager.onTopologyChange(() => void load());
    return off;
  }, [load]);

  const setSecret = useCallback(async (plugin: string, key: string, value: string) => {
    const id = connectionManager.primaryId();
    await connectionManager.invokeOne(id, "set_plugin_secret", { plugin, key, value });
    setSecretStatus((s) => ({ ...s, [plugin]: Array.from(new Set([...(s[plugin] ?? []), key])) }));
  }, []);

  const clearSecret = useCallback(async (plugin: string, key: string) => {
    const id = connectionManager.primaryId();
    await connectionManager.invokeOne(id, "clear_plugin_secret", { plugin, key });
    setSecretStatus((s) => ({ ...s, [plugin]: (s[plugin] ?? []).filter((k) => k !== key) }));
  }, []);

  const anyWebhooks = (plugins ?? []).some((p) => p.webhooks?.length);

  const renderRow = (plugin: PluginInfo) => {
    const enabled = !disabledPlugins.includes(plugin.name);
    const hasConfig = (plugin.config?.length ?? 0) > 0;
    const inbound = (plugin.webhooks ?? []).filter((w) => w.direction === "in" && w.route);
    return (
      <div key={plugin.name} className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-sm">{plugin.manifestName ?? plugin.name}</span>
              {plugin.version && <span className="text-muted-foreground text-xs">v{plugin.version}</span>}
              {/* Gate on `=== false`: an older server binary omits the field, and
                  absent must read as compatible, not incompatible. */}
              {plugin.compatible === false && (
                <Badge variant="destructive" title={plugin.incompatibleReason}>
                  {t("incompatible")}
                </Badge>
              )}
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
              {plugin.roles.includes("webhook") && (
                <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                  <WebhookIcon className="size-3" />
                  {t("role.webhook", { count: plugin.webhooks.length })}
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

        {enabled && hasConfig && (
          <div className="space-y-3 border-t pt-3">
            {plugin.config.map((field) => (
              <ConfigFieldRow
                key={field.key}
                plugin={plugin.name}
                field={field}
                value={pluginConfig[plugin.name]?.[field.key]}
                secretSet={(secretStatus[plugin.name] ?? []).includes(field.key)}
                onChange={(v) => onConfigChange(plugin.name, field.key, v)}
                onSaveSecret={(v) => setSecret(plugin.name, field.key, v)}
                onClearSecret={() => clearSecret(plugin.name, field.key)}
              />
            ))}
          </div>
        )}

        {enabled && inbound.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            {inbound.map((w) => (
              <InboundUrl key={w.id} url={`${serverBase()}/hooks/${plugin.name}/${w.route}`} label={t("inboundUrl")} />
            ))}
          </div>
        )}
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

        {anyWebhooks && (
          <Alert>
            <TriangleAlertIcon className="size-4" />
            <AlertTitle>{t("webhookWarning.title")}</AlertTitle>
            <AlertDescription>{t("webhookWarning.body")}</AlertDescription>
          </Alert>
        )}

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

/** One config field. Secrets use Save/Clear rpcs; everything else binds to the draft. */
function ConfigFieldRow({
  field,
  value,
  secretSet,
  onChange,
  onSaveSecret,
  onClearSecret,
}: {
  plugin: string;
  field: PluginConfigField;
  value: string | number | boolean | undefined;
  secretSet: boolean;
  onChange: (v: string | number | boolean) => void;
  onSaveSecret: (v: string) => Promise<void>;
  onClearSecret: () => Promise<void>;
}) {
  const t = useTranslations("settings.plugins");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  if (field.type === "secret") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            type="password"
            value={draft}
            placeholder={secretSet ? "••••••••" : field.placeholder}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || draft.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await onSaveSecret(draft);
                setDraft("");
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("secret.save")}
          </Button>
          {secretSet && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onClearSecret()}>
              {t("secret.clear")}
            </Button>
          )}
        </div>
        {secretSet && (
          <p className="inline-flex items-center gap-1 text-muted-foreground text-xs">
            <CheckIcon className="size-3 text-green-500" />
            {t("secret.configured")}
          </p>
        )}
        {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4">
        <Label className="text-xs">{field.label}</Label>
        <Switch checked={Boolean(value ?? field.default)} onCheckedChange={(c) => onChange(c)} />
      </div>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{field.label}</Label>
        <select
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          value={String(value ?? field.default ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
      </div>
    );
  }

  // string | number (multiselect falls back to a comma-separated text field)
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        type={field.type === "number" ? "number" : "text"}
        value={String(value ?? field.default ?? "")}
        placeholder={field.placeholder}
        onChange={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
      />
      {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
    </div>
  );
}

/** Read-only inbound webhook URL with a copy button. */
function InboundUrl({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{url}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
        </Button>
      </div>
    </div>
  );
}

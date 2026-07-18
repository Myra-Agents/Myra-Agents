"use client";

import { useCallback, useMemo, useState } from "react";

import { CheckIcon, KeyRoundIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Connection } from "@/lib/connections/types";
import { deployInstance, type SecretInput } from "@/lib/integrations/deploy";
import { track } from "@/lib/posthog/events";
import { cn } from "@/lib/utils";
import type { PluginConfigField, PluginInfo, PluginInstance } from "@/types/settings";

import { EventChips } from "./event-chips";

type Step = 1 | 2 | 3;

export interface WizardEditTarget {
  instance: PluginInstance;
  /** Connection ids the instance is currently deployed on. */
  connIds: string[];
  /** Secret field keys already set on at least one machine (names only). */
  secretKeys: string[];
}

/** A machine is selectable only while connected — fan-out can't write offline. */
function isOnline(conn: Connection): boolean {
  return conn.status === "connected" || conn.status === "connecting";
}

function serverBase(conn: Connection): string {
  return conn.baseUrl || "http://127.0.0.1:4319";
}

function outboundSpec(plugin: PluginInfo) {
  return plugin.webhooks?.find((w) => w.direction === "out");
}
function inboundSpec(plugin: PluginInfo) {
  return plugin.webhooks?.find((w) => w.direction === "in" && w.route);
}

/**
 * The connect wizard: create or edit an integration instance in three steps —
 * pick a plugin, configure it (label, config, editable events + template,
 * secrets), then choose which linked machines it deploys to. On finish it fans
 * the instance out via {@link deployInstance}.
 */
export function ConnectWizard({
  open,
  onClose,
  plugins,
  connections,
  editing,
  onDeployed,
}: {
  open: boolean;
  onClose: () => void;
  plugins: PluginInfo[];
  connections: Connection[];
  editing?: WizardEditTarget;
  onDeployed: () => void;
}) {
  const t = useTranslations("settings.integrations.wizard");

  // Only webhook-declaring plugins can be instanced.
  const webhookPlugins = useMemo(() => plugins.filter((p) => (p.webhooks?.length ?? 0) > 0), [plugins]);

  const [step, setStep] = useState<Step>(editing ? 2 : 1);
  const [pluginName, setPluginName] = useState<string>(editing?.instance.plugin ?? "");
  const [instanceId] = useState<string>(editing?.instance.id ?? crypto.randomUUID());
  const [label, setLabel] = useState<string>(editing?.instance.label ?? "");
  const [config, setConfig] = useState<Record<string, string | number | boolean>>(editing?.instance.config ?? {});
  const [events, setEvents] = useState<string[]>(editing?.instance.events ?? []);
  const [template, setTemplate] = useState<string>(editing?.instance.template ?? "");
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [selectedConns, setSelectedConns] = useState<Set<string>>(
    () =>
      new Set(
        editing?.connIds ??
          connections
            .filter(isOnline)
            .slice(0, 1)
            .map((c) => c.id),
      ),
  );
  const [busy, setBusy] = useState(false);

  const plugin = useMemo(() => plugins.find((p) => p.name === pluginName), [plugins, pluginName]);
  const out = plugin ? outboundSpec(plugin) : undefined;
  const inbound = plugin ? inboundSpec(plugin) : undefined;
  const secretFields = (plugin?.config ?? []).filter((f) => f.type === "secret");
  const allSecretKeys = secretFields.map((f) => f.key);

  // Effective events/template: instance override falls back to the manifest's.
  const effectiveEvents = events.length > 0 ? events : (out?.events ?? []);

  const reset = useCallback(() => {
    onClose();
  }, [onClose]);

  const pickPlugin = (name: string) => {
    setPluginName(name);
    const p = plugins.find((x) => x.name === name);
    // Seed label + events/template from the manifest so the form starts populated.
    if (!editing) {
      setLabel((l) => l || (p?.manifestName ?? name));
      const o = p ? outboundSpec(p) : undefined;
      setEvents(o?.events ?? []);
      setTemplate(o?.template ?? "");
    }
    setStep(2);
  };

  const deploy = async () => {
    if (!plugin) return;
    setBusy(true);
    try {
      const instance: PluginInstance = {
        id: instanceId,
        plugin: plugin.name,
        label: label.trim() || plugin.name,
        enabled: editing?.instance.enabled ?? true,
        config,
        // Persist overrides only when they differ from the manifest defaults.
        events: events.length > 0 ? events : undefined,
        template: template.trim().length > 0 ? template : undefined,
      };
      const secretInputs: SecretInput[] = Object.entries(secrets)
        .filter(([, v]) => v.length > 0)
        .map(([key, value]) => ({ key, value }));
      const allConnIds = connections.map((c) => c.id);
      const results = await deployInstance({
        instance,
        secrets: secretInputs,
        selectedConnIds: [...selectedConns],
        allConnIds,
        secretKeys: allSecretKeys,
      });
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        toast.error(t("deployPartial", { count: failed.length }));
      } else {
        toast.success(t("deployOk", { label: instance.label }));
      }
      track("integration_connected", { plugin: plugin.name, roles: plugin.roles });
      onDeployed();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canConfigure = pluginName.length > 0;
  const canDeploy = canConfigure && label.trim().length > 0 && selectedConns.size > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && reset()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t("titleEdit") : t("titleNew")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <Stepper step={step} t={t} />

        {step === 1 && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">{t("pickPlugin")}</p>
            {webhookPlugins.length === 0 && <p className="text-muted-foreground text-sm">{t("noPlugins")}</p>}
            <div className="grid grid-cols-2 gap-2">
              {webhookPlugins.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => pickPlugin(p.name)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                    pluginName === p.name && "border-primary/50 bg-primary/10",
                  )}
                >
                  <div className="truncate font-medium text-sm">{p.manifestName ?? p.name}</div>
                  <div className="truncate text-muted-foreground text-xs">{p.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && plugin && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("label")}</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} />
            </div>

            {(plugin.config ?? []).map((field) => (
              <WizardField
                key={field.key}
                field={field}
                value={config[field.key]}
                secretDraft={secrets[field.key] ?? ""}
                secretAlreadySet={editing?.secretKeys.includes(field.key) ?? false}
                onValue={(v) => setConfig((c) => ({ ...c, [field.key]: v }))}
                onSecret={(v) => setSecrets((s) => ({ ...s, [field.key]: v }))}
              />
            ))}

            {out && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("events")}</Label>
                  <EventChips value={effectiveEvents} onChange={setEvents} ariaLabel={t("events")} />
                  <p className="text-muted-foreground text-xs">{t("eventsHint")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("template")}</Label>
                  <Textarea
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    placeholder={out.template ?? '{"text":"{{card.title}} → {{card.status}}"}'}
                    className="font-mono text-xs"
                    rows={3}
                  />
                  <p className="text-muted-foreground text-xs">{t("templateHint")}</p>
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && plugin && (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">{t("pickMachines")}</p>
            <div className="space-y-1.5">
              {connections.map((conn) => {
                const online = isOnline(conn);
                const checked = selectedConns.has(conn.id);
                return (
                  <button
                    key={conn.id}
                    type="button"
                    disabled={!online && !checked}
                    onClick={() =>
                      setSelectedConns((prev) => {
                        const next = new Set(prev);
                        if (next.has(conn.id)) next.delete(conn.id);
                        else next.add(conn.id);
                        return next;
                      })
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      checked ? "border-primary/45 bg-primary/10" : "hover:bg-muted",
                      !online && !checked && "opacity-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded border",
                        checked && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {checked && <CheckIcon className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{conn.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {conn.kind}
                      {!online && ` · ${t("offline")}`}
                    </span>
                  </button>
                );
              })}
            </div>

            {inbound && selectedConns.size > 0 && (
              <div className="space-y-1.5 rounded-lg border p-3">
                <Label className="text-xs">{t("inboundUrl")}</Label>
                {connections
                  .filter((c) => selectedConns.has(c.id))
                  .map((c) => (
                    <code key={c.id} className="block truncate rounded bg-muted px-2 py-1 text-xs">
                      {`${serverBase(c)}/hooks/i/${instanceId}/${inbound.route}`}
                    </code>
                  ))}
              </div>
            )}

            {allSecretKeys.length > 0 && (
              <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <p>{t("secretNote")}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => (step === 1 ? reset() : setStep((s) => (s - 1) as Step))}
          >
            {step === 1 ? t("cancel") : t("back")}
          </Button>
          {step < 3 ? (
            <Button
              size="sm"
              disabled={step === 1 ? !canConfigure : !canConfigure || label.trim().length === 0}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              {t("next")}
            </Button>
          ) : (
            <Button size="sm" disabled={!canDeploy || busy} onClick={() => void deploy()}>
              {busy && <Loader2Icon className="size-3.5 animate-spin" />}
              {editing ? t("save") : t("deploy")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step, t }: { step: Step; t: ReturnType<typeof useTranslations> }) {
  const steps: Array<{ n: Step; key: string }> = [
    { n: 1, key: "stepPlugin" },
    { n: 2, key: "stepConfigure" },
    { n: 3, key: "stepMachines" },
  ];
  return (
    <div className="flex items-center gap-1 text-xs">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-1">
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full border font-medium",
              step === s.n && "border-primary bg-primary text-primary-foreground",
              step > s.n && "border-primary/50 bg-primary/15 text-primary",
            )}
          >
            {step > s.n ? <CheckIcon className="size-3" /> : s.n}
          </span>
          <span className={cn("text-muted-foreground", step === s.n && "text-foreground")}>{t(s.key)}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-border" />}
        </div>
      ))}
    </div>
  );
}

/** One config field in the wizard. Secrets buffer in state (pushed on deploy), not via RPC. */
function WizardField({
  field,
  value,
  secretDraft,
  secretAlreadySet,
  onValue,
  onSecret,
}: {
  field: PluginConfigField;
  value: string | number | boolean | undefined;
  secretDraft: string;
  secretAlreadySet: boolean;
  onValue: (v: string | number | boolean) => void;
  onSecret: (v: string) => void;
}) {
  const t = useTranslations("settings.integrations.wizard");

  if (field.type === "secret") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
          {secretAlreadySet && (
            <Badge variant="secondary" className="ml-2">
              {t("secretSet")}
            </Badge>
          )}
        </Label>
        <Input
          type="password"
          value={secretDraft}
          placeholder={secretAlreadySet ? "••••••••" : field.placeholder}
          onChange={(e) => onSecret(e.target.value)}
        />
        {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4">
        <Label className="text-xs">{field.label}</Label>
        <Switch checked={Boolean(value ?? field.default)} onCheckedChange={(c) => onValue(c)} />
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
          onChange={(e) => onValue(e.target.value)}
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
        onChange={(e) => onValue(field.type === "number" ? Number(e.target.value) : e.target.value)}
      />
      {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";

import {
  CheckCircle2Icon,
  CircleIcon,
  CopyIcon,
  KeyRoundIcon,
  NetworkIcon,
  PlusIcon,
  ServerIcon,
  TrashIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConnections } from "@/hooks/use-connections";
import type { ConnectionStatus } from "@/lib/connections/types";
import { hubLogin } from "@/lib/transport/hub";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "text-green-500",
  connecting: "text-amber-500",
  error: "text-destructive",
  disabled: "text-muted-foreground",
};

/**
 * Settings → Connections. Lists every backend the aggregated board talks to,
 * lets the user add/remove remotes, pick the primary (default add-card target),
 * and toggle per-server board visibility. The local connection is permanent.
 */
export function ConnectionsPanel() {
  const t = useTranslations("settings.connections");
  const {
    connections,
    hubs,
    primaryId,
    add,
    remove,
    addHub,
    removeHub,
    pairHub,
    revokeHubInstance,
    setPrimary,
    toggleVisible,
    isVisible,
  } = useConnections();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [hubUrl, setHubUrl] = useState("");
  const [hubUser, setHubUser] = useState("");
  const [hubBusy, setHubBusy] = useState(false);
  // The freshly minted pairing code for one hub (cleared when another is paired).
  const [pairing, setPairing] = useState<{ hubId: string; code: string; expiresAt: number } | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [installOs, setInstallOs] = useState<"unix" | "windows">("unix");

  const handlePair = async (hubId: string) => {
    setPairBusy(true);
    try {
      const { code, expiresAt } = await pairHub(hubId);
      setPairing({ hubId, code, expiresAt });
    } catch {
      toast.error(t("hub.pairFailed"));
    } finally {
      setPairBusy(false);
    }
  };

  const handleRevoke = async (hubId: string, instanceId: string) => {
    try {
      await revokeHubInstance(hubId, instanceId);
      toast.success(t("hub.revoked"));
    } catch {
      toast.error(t("hub.revokeFailed"));
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success(t("hub.copied"));
  };

  const handleAdd = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//.test(trimmed)) {
      toast.error(t("invalidUrl"));
      return;
    }
    add({ label: label.trim() || trimmed, baseUrl: trimmed });
    setLabel("");
    setUrl("");
    toast.success(t("added"));
  };

  const handleAddHub = async () => {
    const trimmed = hubUrl.trim();
    const user = hubUser.trim();
    if (!trimmed || !user) return;
    if (!/^https?:\/\//.test(trimmed)) {
      toast.error(t("invalidUrl"));
      return;
    }
    setHubBusy(true);
    try {
      const token = await hubLogin(trimmed, user);
      addHub({ label: `${user} @ ${trimmed.replace(/^https?:\/\//, "")}`, baseUrl: trimmed, token });
      setHubUrl("");
      setHubUser("");
      toast.success(t("hub.added"));
    } catch {
      toast.error(t("hub.loginFailed"));
    } finally {
      setHubBusy(false);
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

        <div className="space-y-2">
          {connections.map((conn) => {
            const isPrimary = conn.id === primaryId;
            const visible = isVisible(conn.id);
            const isLocal = conn.id === "local";
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
                  </p>
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

        <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">{t("labelField")}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("labelPlaceholder")}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("urlField")}</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="http://127.0.0.1:4317"
              className="h-8 font-mono text-xs"
            />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={!url.trim()}>
            <PlusIcon className="size-3" />
            {t("add")}
          </Button>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <NetworkIcon className="size-4 text-muted-foreground" />
            <span className="font-medium text-sm">{t("hub.title")}</span>
          </div>
          <p className="text-muted-foreground text-sm">{t("hub.description")}</p>

          {hubs.length > 0 && (
            <div className="space-y-3">
              {hubs.map((hub) => {
                const instances = connections.filter((c) => c.hubId === hub.id);
                const code = pairing?.code ?? "<code>";
                const host = hub.baseUrl.replace(/\/$/, "");
                const enrollCmd =
                  installOs === "unix"
                    ? `curl -sSf ${host}/install-remote.sh | MYRA_HUB_URL=${host} CODE=${code} sh`
                    : `$env:MYRA_HUB_URL="${host}"; $env:CODE="${code}"; iwr ${host}/install-remote.ps1 | iex`;
                return (
                  <div key={hub.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <NetworkIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <span className="truncate font-medium text-sm">{hub.label}</span>
                        <p className="truncate font-mono text-muted-foreground text-xs">{hub.baseUrl}</p>
                      </div>
                      <Button variant="outline" size="sm" disabled={pairBusy} onClick={() => handlePair(hub.id)}>
                        <KeyRoundIcon className="size-3" />
                        {t("hub.pair")}
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => removeHub(hub.id)} title={t("hub.remove")}>
                        <TrashIcon />
                      </Button>
                    </div>

                    {pairing?.hubId === hub.id && (
                      <div className="space-y-2 rounded-md bg-muted/50 p-2">
                        <div className="flex items-center gap-2">
                          <code className="flex-1 font-mono text-base tracking-widest">{pairing.code}</code>
                          <span className="text-muted-foreground text-xs">
                            {t("hub.expires", { time: new Date(pairing.expiresAt).toLocaleTimeString() })}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => copy(pairing.code)}
                            title={t("hub.copy")}
                          >
                            <CopyIcon />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-muted-foreground text-xs">{t("hub.enrollHint")}</p>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant={installOs === "unix" ? "secondary" : "ghost"}
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => setInstallOs("unix")}
                            >
                              {t("hub.osUnix")}
                            </Button>
                            <Button
                              variant={installOs === "windows" ? "secondary" : "ghost"}
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => setInstallOs("windows")}
                            >
                              {t("hub.osWindows")}
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-background p-1.5 font-mono text-xs">
                            {enrollCmd}
                          </code>
                          <Button variant="ghost" size="icon-xs" onClick={() => copy(enrollCmd)} title={t("hub.copy")}>
                            <CopyIcon />
                          </Button>
                        </div>
                      </div>
                    )}

                    {instances.length > 0 && (
                      <div className="space-y-1 border-t pt-2">
                        {instances.map((inst) => (
                          <div key={inst.id} className="flex items-center gap-2 pl-1">
                            <CircleIcon className={cn("size-2.5 shrink-0 fill-current", STATUS_COLOR[inst.status])} />
                            <span className="min-w-0 flex-1 truncate text-sm">{inst.label}</span>
                            <span className="text-muted-foreground text-xs">{t(`status.${inst.status}`)}</span>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => inst.instanceId && handleRevoke(hub.id, inst.instanceId)}
                              title={t("hub.revoke")}
                            >
                              <TrashIcon />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">{t("hub.userField")}</Label>
              <Input
                value={hubUser}
                onChange={(e) => setHubUser(e.target.value)}
                placeholder={t("hub.userPlaceholder")}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("urlField")}</Label>
              <Input
                value={hubUrl}
                onChange={(e) => setHubUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddHub()}
                placeholder={t("hub.urlPlaceholder")}
                className="h-8 font-mono text-xs"
              />
            </div>
            <Button size="sm" onClick={handleAddHub} disabled={hubBusy || !hubUrl.trim() || !hubUser.trim()}>
              <PlusIcon className="size-3" />
              {t("hub.add")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";

import { CheckCircle2Icon, GlobeIcon, RadioTowerIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConnections } from "@/hooks/use-connections";
import { useRemoteAccess } from "@/hooks/use-remote-access";
import { cn } from "@/lib/utils";

/**
 * Settings → Remote Access (desktop, Pro-gated). Turns this computer into a
 * persistent, hub-enrolled instance reachable from the web app anywhere, or
 * stops it. Pairing mints a code against a registered hub, then hands it to the
 * `enable_remote_access` Tauri command. Rendered only when `isTauri() && isPro`.
 */
export function RemoteAccessPanel() {
  const t = useTranslations("settings.connections.remote");
  const { hubs, pairHub } = useConnections();
  const { status, loading, busy, enable, disable } = useRemoteAccess();

  const [hubId, setHubId] = useState<string>("");
  const [label, setLabel] = useState<string>("");

  // Default the hub picker + label once data is available.
  useEffect(() => {
    if (!hubId && hubs.length > 0) setHubId(hubs[0].id);
  }, [hubs, hubId]);
  useEffect(() => {
    if (!label && status) setLabel(status.label ?? status.instanceId ?? "");
  }, [status, label]);

  const enabled = status?.enrolled === true;

  const handleEnable = async () => {
    const hub = hubs.find((h) => h.id === hubId);
    if (!hub) return;
    try {
      const { code } = await pairHub(hub.id);
      await enable(hub.baseUrl, code, label.trim() || hub.label);
      toast.success(t("enabled"));
    } catch {
      toast.error(t("enableFailed"));
    }
  };

  const handleDisable = async () => {
    try {
      await disable();
      toast.success(t("disabled"));
    } catch {
      toast.error(t("disableFailed"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RadioTowerIcon className="size-4 text-muted-foreground" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{t("description")}</p>

        <div className="flex items-center gap-2 rounded-md border p-3">
          {enabled ? (
            <CheckCircle2Icon className="size-4 shrink-0 text-green-500" />
          ) : (
            <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <p className={cn("text-sm", enabled ? "text-foreground" : "text-muted-foreground")}>
            {enabled ? t("reachable", { hub: status?.hubUrl ?? "", label: status?.label ?? "" }) : t("localOnly")}
          </p>
        </div>

        {enabled ? (
          <Button variant="outline" size="sm" disabled={busy || loading} onClick={handleDisable}>
            {t("stop")}
          </Button>
        ) : hubs.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">{t("needHub")}</p>
        ) : (
          <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            {hubs.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs">{t("hubField")}</Label>
                <Select value={hubId} onValueChange={setHubId}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hubs.map((hub) => (
                      <SelectItem key={hub.id} value={hub.id}>
                        {hub.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{t("labelField")}</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8" />
            </div>
            <Button size="sm" disabled={busy || loading || !hubId} onClick={handleEnable}>
              <RadioTowerIcon className="size-3" />
              {t("enable")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";

import { CheckCircle2Icon, CircleIcon, PlusIcon, ServerIcon, TrashIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConnections } from "@/hooks/use-connections";
import type { ConnectionStatus } from "@/lib/connections/types";
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
  const { connections, primaryId, add, remove, setPrimary, toggleVisible, isVisible } = useConnections();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

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
      </CardContent>
    </Card>
  );
}

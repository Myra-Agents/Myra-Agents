"use client";

import { type ChangeEvent, useCallback, useRef, useState } from "react";

import { isTauri } from "@tauri-apps/api/core";
import {
  DownloadIcon,
  PaletteIcon,
  PlusIcon,
  SaveIcon,
  SettingsIcon,
  Trash2Icon,
  TrashIcon,
  UploadIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ConnectionsPanel } from "@/components/settings/connections-panel";
import { HubStatusCard } from "@/components/settings/hub-status-card";
import { RemoteAccessPanel } from "@/components/settings/remote-access-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEntitlement } from "@/hooks/use-entitlement";
import { useSettings } from "@/hooks/use-settings";
import { useTheme } from "@/hooks/use-theme";
import { setAppLocale } from "@/i18n/provider";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { invoke } from "@/lib/tauri";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import type { AgentPreset, AppSettings } from "@/types/settings";
import { DEFAULT_AGENT_PRESETS } from "@/types/settings";

type DataAction = "export" | "import" | "clear";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { isPro } = useEntitlement();
  const { settings, loading, error, save } = useSettings();
  const { setTheme } = useTheme();
  const setThemeMode = usePreferencesStore((state) => state.setThemeMode);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [dataAction, setDataAction] = useState<DataAction | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const current = draft ?? settings;

  const update = useCallback(
    (patch: Partial<AppSettings>) => {
      setDraft((prev) => ({ ...(prev ?? settings), ...patch }));
    },
    [settings],
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;

    setSaving(true);
    try {
      await save(draft);
      setDraft(null);
      toast.success(t("feedback.saved"));
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, t("feedback.saveFailed")));
    } finally {
      setSaving(false);
    }
  }, [draft, save, t]);

  const handleLocaleChange = (locale: string) => {
    update({ locale: locale as AppSettings["locale"] });
    setAppLocale(locale);
  };

  const handleThemeChange = (theme: string) => {
    const nextTheme = theme as AppSettings["theme"];
    update({ theme: nextTheme });
    setTheme(nextTheme);
    setThemeMode(nextTheme);
    void persistPreference("theme_mode", nextTheme);
  };

  const handleExportBoard = useCallback(async () => {
    setDataAction("export");

    try {
      const data = await invoke<unknown>("get_cards");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `myra-agents-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("feedback.exported"));
    } catch (exportError) {
      console.error("Failed to export board:", exportError);
      toast.error(getErrorMessage(exportError, t("feedback.exportFailed")));
    } finally {
      setDataAction(null);
    }
  }, [t]);

  const handleImportBoard = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setDataAction("import");

      try {
        const content = await file.text();
        const cards = JSON.parse(content);
        await invoke("import_cards", { cards });
        toast.success(t("feedback.imported"));
      } catch (importError) {
        console.error("Failed to import board:", importError);
        toast.error(getErrorMessage(importError, t("feedback.importFailed")));
      } finally {
        event.target.value = "";
        setDataAction(null);
      }
    },
    [t],
  );

  const handleClearLogs = useCallback(async () => {
    if (!window.confirm(t("data.clearLogsConfirm"))) {
      return;
    }

    setDataAction("clear");

    try {
      await invoke("clear_logs");
      toast.success(t("feedback.logsCleared"));
    } catch (clearError) {
      console.error("Failed to clear logs:", clearError);
      toast.error(getErrorMessage(clearError, t("feedback.clearFailed")));
    } finally {
      setDataAction(null);
    }
  }, [t]);

  const addCustomPreset = () => {
    const preset: AgentPreset = {
      id: `custom-${Date.now()}`,
      name: t("agents.customAgent"),
      binary: "",
      argsTemplate: "{prompt}",
    };
    update({ agents: [...current.agents, preset] });
  };

  const updatePreset = (idx: number, patch: Partial<AgentPreset>) => {
    const agents = current.agents.map((preset, index) => (index === idx ? { ...preset, ...patch } : preset));
    update({ agents });
  };

  const removePreset = (idx: number) => {
    update({ agents: current.agents.filter((_, index) => index !== idx) });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="size-5 text-muted-foreground" />
          <h1 className="font-semibold text-xl tracking-tight">{t("title")}</h1>
        </div>
        {draft && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <SaveIcon className="size-3.5" />
            {saving ? t("actions.saving") : t("actions.save")}
          </Button>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Tabs defaultValue="hub" className="w-full">
        <TabsList variant="line">
          <TabsTrigger value="hub">{t("tabs.hub")}</TabsTrigger>
          <TabsTrigger value="preferences">{t("tabs.preferences")}</TabsTrigger>
          <TabsTrigger value="agents">{t("tabs.agents")}</TabsTrigger>
          <TabsTrigger value="data">{t("tabs.data")}</TabsTrigger>
        </TabsList>

        <TabsContent value="hub" className="space-y-6">
          {isPro && <HubStatusCard />}
          <ConnectionsPanel />
          {isTauri() && isPro && <RemoteAccessPanel />}
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("preferences.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t("preferences.language")}</Label>
                  <Select value={current.locale} onValueChange={handleLocaleChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t("preferences.languageOptions.autoDetect")}</SelectItem>
                      <SelectItem value="en">{t("preferences.languageOptions.english")}</SelectItem>
                      <SelectItem value="fr">{t("preferences.languageOptions.french")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("preferences.defaultPage")}</Label>
                  <Select
                    value={current.defaultHomePage}
                    onValueChange={(value) => update({ defaultHomePage: value as AppSettings["defaultHomePage"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kanban">{t("preferences.pageOptions.kanban")}</SelectItem>
                      <SelectItem value="schedules">{t("preferences.pageOptions.schedules")}</SelectItem>
                      <SelectItem value="planner">{t("preferences.pageOptions.planner")}</SelectItem>
                      <SelectItem value="logs">{t("preferences.pageOptions.logs")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("preferences.theme")}</Label>
                  <Select value={current.theme} onValueChange={handleThemeChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">{t("preferences.themeOptions.light")}</SelectItem>
                      <SelectItem value="dark">{t("preferences.themeOptions.dark")}</SelectItem>
                      <SelectItem value="system">{t("preferences.themeOptions.system")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border border-dashed px-4 py-3 text-muted-foreground text-sm">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <PaletteIcon className="size-4 text-muted-foreground" />
                  {t("preferences.themeDescription")}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t("agents.title")}</CardTitle>
              <Button variant="outline" size="sm" onClick={addCustomPreset}>
                <PlusIcon className="size-3" />
                {t("agents.add")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("agents.defaultAgent")}</Label>
                <Select value={current.defaultAgentId} onValueChange={(value) => update({ defaultAgentId: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {current.agents.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("agents.maxConcurrent")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={current.maxConcurrentAgents}
                  onChange={(event) => update({ maxConcurrentAgents: Math.max(0, Number(event.target.value) || 0) })}
                  className="h-8 w-28"
                />
                <p className="text-muted-foreground text-xs">{t("agents.maxConcurrentHint")}</p>
              </div>

              <Separator />

              {current.agents.map((preset, idx) => (
                <div key={preset.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold text-sm">{preset.name}</Label>
                    {!DEFAULT_AGENT_PRESETS.some((defaultPreset) => defaultPreset.id === preset.id) && (
                      <Button variant="ghost" size="icon-xs" onClick={() => removePreset(idx)}>
                        <TrashIcon />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("agents.name")}</Label>
                      <Input
                        value={preset.name}
                        onChange={(event) => updatePreset(idx, { name: event.target.value })}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("agents.binary")}</Label>
                      <Input
                        value={preset.binary}
                        onChange={(event) => updatePreset(idx, { binary: event.target.value })}
                        className="h-7 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("agents.argsTemplate")}</Label>
                    <Input
                      value={preset.argsTemplate}
                      onChange={(event) => updatePreset(idx, { argsTemplate: event.target.value })}
                      placeholder="{prompt}"
                      className="h-7 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("agents.workingDir")}</Label>
                    <Input
                      value={preset.workingDir ?? ""}
                      onChange={(event) => updatePreset(idx, { workingDir: event.target.value || undefined })}
                      placeholder={t("agents.workingDirPlaceholder")}
                      className="h-7 font-mono text-xs"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("data.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportBoard}
              />

              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{t("data.exportBoard")}</p>
                  <p className="text-muted-foreground text-sm">{t("data.exportDescription")}</p>
                </div>
                <Button variant="outline" onClick={handleExportBoard} disabled={dataAction !== null}>
                  <DownloadIcon className="size-4" />
                  {dataAction === "export" ? t("actions.exporting") : t("data.exportBoard")}
                </Button>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{t("data.importBoard")}</p>
                  <p className="text-muted-foreground text-sm">{t("data.importDescription")}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => importInputRef.current?.click()}
                  disabled={dataAction !== null}
                >
                  <UploadIcon className="size-4" />
                  {dataAction === "import" ? t("actions.importing") : t("data.importBoard")}
                </Button>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{t("data.clearLogs")}</p>
                  <p className="text-muted-foreground text-sm">{t("data.clearLogsDescription")}</p>
                </div>
                <Button variant="destructive" onClick={handleClearLogs} disabled={dataAction !== null}>
                  <Trash2Icon className="size-4" />
                  {dataAction === "clear" ? t("actions.clearing") : t("data.clearLogs")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

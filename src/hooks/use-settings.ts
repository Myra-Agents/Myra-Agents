import { useCallback, useEffect, useState } from "react";

import { connectionManager } from "@/lib/connections/manager";
import { isDevModeError } from "@/lib/tauri";
import type { AppSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";

/**
 * Load/save settings for one connection. Settings (agent presets, concurrency)
 * are **per-server**, never merged — pass the connection id to scope the
 * settings UI to a specific server; defaults to the primary connection.
 */
export function useSettings(connId?: string) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetId = connId ?? undefined;

  const load = useCallback(async () => {
    const id = targetId ?? connectionManager.primaryId();
    try {
      setError(null);
      const data = await connectionManager.invokeOne<Partial<AppSettings>>(id, "get_settings");
      setSettings({
        ...DEFAULT_SETTINGS,
        ...data,
        agents: data.agents ?? DEFAULT_SETTINGS.agents,
      });
    } catch (e) {
      if (!isDevModeError(e)) {
        console.error("Failed to load settings:", e);
        setError(String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => {
    void load();
    const off = connectionManager.onTopologyChange(() => void load());
    return off;
  }, [load]);

  const save = useCallback(
    async (updated: AppSettings) => {
      const id = targetId ?? connectionManager.primaryId();
      try {
        setError(null);
        await connectionManager.invokeOne(id, "save_settings", { settings: updated });
        setSettings(updated);
      } catch (e) {
        console.error("Failed to save settings:", e);
        setError(String(e));
        throw e;
      }
    },
    [targetId],
  );

  return { settings, loading, error, save, reload: load };
}

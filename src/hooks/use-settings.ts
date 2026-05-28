import { useCallback, useEffect, useState } from "react";

import { invoke, isDevModeError } from "@/lib/tauri";
import type { AppSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";

/**
 * Hook to load/save app settings from the Rust backend.
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await invoke<Partial<AppSettings>>("get_settings");
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (updated: AppSettings) => {
    try {
      setError(null);
      await invoke("save_settings", { settings: updated });
      setSettings(updated);
    } catch (e) {
      console.error("Failed to save settings:", e);
      setError(String(e));
      throw e;
    }
  }, []);

  return { settings, loading, error, save, reload: load };
}

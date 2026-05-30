import type { Store } from "../store";
import type { AppSettings } from "../types/settings";

export async function getSettings(store: Store): Promise<AppSettings> {
  return store.getSettings();
}

export async function saveSettings(store: Store, settings: AppSettings): Promise<AppSettings> {
  await store.saveSettings(settings);
  return settings;
}

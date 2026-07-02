import { isTauri, invoke as tauriInvoke } from "@tauri-apps/api/core";

/**
 * The "home folder" the schedule editor's folder picker browses from. Stored
 * app-locally (not in server-persisted AppSettings, which round-trips through the
 * prebuilt sidecar and would drop unknown fields). Empty = resolve to the OS home
 * directory at runtime.
 */
const HOME_FOLDER_KEY = "myra:settings:homeFolder";

export function getHomeFolderSetting(): string {
  try {
    return window.localStorage.getItem(HOME_FOLDER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setHomeFolderSetting(value: string): void {
  try {
    if (value.trim()) window.localStorage.setItem(HOME_FOLDER_KEY, value.trim());
    else window.localStorage.removeItem(HOME_FOLDER_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

/** The OS user home directory (desktop only); "" in a plain browser. */
export async function osHomeDir(): Promise<string> {
  if (!isTauri()) return "";
  try {
    return await tauriInvoke<string>("home_dir");
  } catch {
    return "";
  }
}

/** Effective home folder: the configured setting, else the OS home directory. */
export async function resolveHomeFolder(): Promise<string> {
  return getHomeFolderSetting() || (await osHomeDir());
}

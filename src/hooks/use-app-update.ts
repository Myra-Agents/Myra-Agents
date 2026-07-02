import { useCallback, useEffect, useState } from "react";

import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check as checkForUpdate, type Update } from "@tauri-apps/plugin-updater";

import { isTauri } from "@/lib/tauri";

/**
 * Desktop-only self-update wrapper around Tauri's updater/process plugins.
 * `check()` hits the GitHub Releases `latest.json` endpoint configured in
 * `tauri.conf.json` and returns whether a newer *signed* build exists;
 * `installAndRelaunch()` downloads + verifies + installs it, then relaunches.
 *
 * All calls no-op in a plain browser (`isTauri()` false), so the settings panel
 * degrades cleanly under `bun run dev`. Mirrors `useLocalServer` in spirit — but
 * this updates the app shell itself, not the bundled `myra-server` sidecar.
 */
export function useAppUpdate() {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  /** 0..1 download progress; `null` while indeterminate (no content-length). */
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** True once a manual/auto check has completed at least once this mount. */
  const [checkedOnce, setCheckedOnce] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    getVersion()
      .then(setCurrentVersion)
      .catch((e) => console.error("[useAppUpdate] getVersion failed:", e));
  }, []);

  /** Query the update endpoint. Returns true when a newer build is available. */
  const check = useCallback(async (): Promise<boolean> => {
    if (!isTauri()) return false;
    setChecking(true);
    setError(null);
    try {
      const found = await checkForUpdate();
      setUpdate(found);
      return found !== null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      console.error("[useAppUpdate] check failed:", e);
      return false;
    } finally {
      setChecking(false);
      setCheckedOnce(true);
    }
  }, []);

  /** Download + verify + install the pending update, then relaunch the app. */
  const installAndRelaunch = useCallback(async () => {
    if (!update) return;
    setDownloading(true);
    setProgress(null);
    setError(null);
    try {
      let total = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            setProgress(total > 0 ? 0 : null);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (total > 0) setProgress(Math.min(downloaded / total, 1));
            break;
          case "Finished":
            setProgress(1);
            break;
        }
      });
      // Swap complete — restart into the new version.
      await relaunch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      console.error("[useAppUpdate] install failed:", e);
      setDownloading(false);
    }
  }, [update]);

  return {
    /** Version this build reports (`null` outside Tauri / before load). */
    currentVersion,
    /** A newer signed build is available to install. */
    available: update !== null,
    /** The available version string (`null` when up to date). */
    newVersion: update?.version ?? null,
    /** Release notes for the available update, if any. */
    notes: update?.body ?? null,
    checking,
    downloading,
    progress,
    error,
    checkedOnce,
    check,
    installAndRelaunch,
  };
}

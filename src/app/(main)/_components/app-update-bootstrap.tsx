"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { isTauri } from "@/lib/tauri";

// Module-level guard so the silent check runs once per app launch, not on every
// route change that remounts the layout.
let checkedThisSession = false;

/**
 * Headless, desktop-only update probe mounted once in the app shell. On launch it
 * silently asks the updater endpoint whether a newer signed build exists; if so
 * it raises a non-blocking toast that deep-links to Settings → Preferences (where
 * `AppUpdatePanel` does the install). Network/endpoint errors are swallowed —
 * never let an update check interrupt startup.
 */
export function AppUpdateBootstrap() {
  const router = useRouter();
  const t = useTranslations("settings.preferences.appUpdate");

  useEffect(() => {
    if (!isTauri() || checkedThisSession) return;
    checkedThisSession = true;

    void (async () => {
      try {
        const update = await check();
        if (!update) return;
        const current = await getVersion().catch(() => null);
        toast(t("available", { version: update.version }), {
          description: current ? t("current", { version: current }) : undefined,
          duration: 10_000,
          action: {
            label: t("view"),
            onClick: () => router.push("/settings"),
          },
        });
      } catch (e) {
        console.error("[app-update] launch check failed:", e);
      }
    })();
  }, [router, t]);

  return null;
}

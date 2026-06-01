"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { isTauri } from "@tauri-apps/api/core";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useConnections } from "@/hooks/use-connections";
import { useEntitlement } from "@/hooks/use-entitlement";
import { useRemoteAccess } from "@/hooks/use-remote-access";

/** Persisted so the prompt doesn't nag on every launch once dismissed. */
const DISMISS_KEY = "myra.remoteAccessPromptDismissed";

/**
 * Pro desktop first-run consent: proactively offer to make this computer
 * reachable instead of burying it in Settings — but never silently. Shows once
 * when `isTauri() && isPro && !enrolled && !dismissed`. "Enable" pairs against a
 * registered hub and turns remote access on; with no hub yet it routes to
 * Settings to add one. "Not now" persists the dismissal; the manual Settings
 * panel remains available either way.
 */
export function RemoteAccessConsent() {
  const t = useTranslations("settings.connections.remote");
  const router = useRouter();
  const { isPro } = useEntitlement();
  const { hubs, pairHub } = useConnections();
  const { status, loading, busy, enable } = useRemoteAccess();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isTauri() || !isPro || loading || !status || status.enrolled) return;
    const dismissed = typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1";
    if (!dismissed) setOpen(true);
  }, [isPro, loading, status]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // dismissal is a UI nicety — fall back to in-session only.
    }
    setOpen(false);
  };

  const handleEnable = async () => {
    const hub = hubs[0];
    if (!hub) {
      setOpen(false);
      toast.info(t("consent.needHub"));
      router.push("/settings");
      return;
    }
    try {
      const { code } = await pairHub(hub.id);
      await enable(hub.baseUrl, code, status?.label ?? hub.label);
      toast.success(t("enabled"));
      setOpen(false);
    } catch {
      toast.error(t("enableFailed"));
    }
  };

  if (!open) return null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("consent.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("consent.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={dismiss}>{t("consent.notNow")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void handleEnable();
            }}
          >
            {t("consent.enable")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

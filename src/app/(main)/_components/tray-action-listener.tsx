"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { listen } from "@tauri-apps/api/event";

import { useShortcutStore } from "@/stores/shortcut-store";

/** Payload of the `tray-navigate` event emitted by the tray popover's `open_main`. */
interface TrayNavigate {
  path: string;
  newTask: boolean;
}

/**
 * Bridges tray-popover actions into the main window: the popover calls the
 * `open_main` Tauri command (which reveals + focuses this window and emits
 * `tray-navigate`); here we route to the requested path and, for "New task",
 * arm the same pending-new-card flow the ⌘N shortcut uses.
 */
export function TrayActionListener() {
  const router = useRouter();
  const requestNewCard = useShortcutStore((s) => s.requestNewCard);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<TrayNavigate>("tray-navigate", ({ payload }) => {
      router.push(payload.path);
      if (payload.newTask) requestNewCard();
    }).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
  }, [router, requestNewCard]);

  return null;
}

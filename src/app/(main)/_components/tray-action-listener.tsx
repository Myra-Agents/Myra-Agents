"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Payload of the `tray-navigate` event emitted by the tray popover's `open_main`. */
interface TrayNavigate {
  path: string;
  newSchedule: boolean;
}

/**
 * Bridges tray-popover actions into the main window: the popover calls the
 * `open_main` Tauri command (which reveals + focuses this window and emits
 * `tray-navigate`); here we route to the requested path and, for "New patrol",
 * arm the same pending-new-schedule flow the menu uses.
 */
export function TrayActionListener() {
  const router = useRouter();

  useEffect(() => {
    // The tray only exists in the desktop shell; in a plain browser the Tauri
    // event API has no backend and would throw on transformCallback.
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen<TrayNavigate>("tray-navigate", ({ payload }) => {
      router.push(payload.path);
    }).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
  }, [router]);

  return null;
}

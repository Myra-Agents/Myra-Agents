"use client";

import { useEffect } from "react";

import { isTauri } from "@/lib/tauri";

/** Editable surfaces keep the OS menu (copy/paste/spellcheck/lookup). */
function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

/**
 * Suppress WebKit's default right-click menu inside the Tauri webview (Reload,
 * Copy Image, Inspect Element, …) so it doesn't leak into the app chrome. Left
 * untouched in a plain browser, and on editable elements where the native menu
 * is actually useful. Mounted once at the root; custom React `ContextMenu`s
 * still work because they call `preventDefault` first and render their own UI.
 */
export function DisableNativeContextMenu() {
  useEffect(() => {
    if (!isTauri()) return;
    const onContextMenu = (e: MouseEvent) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);
  return null;
}

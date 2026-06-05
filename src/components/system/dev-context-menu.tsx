"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { TerminalIcon } from "lucide-react";

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { isTauri } from "@/lib/tauri";

const DEV = process.env.NODE_ENV === "development";

/** Editable surfaces keep the OS menu (copy/paste/spellcheck) — see `DisableNativeContextMenu`. */
function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

/**
 * Dev-only replacement for the WebKit "Inspect Element" entry, which the global
 * native-menu suppressor strips. Wraps the whole app in a catch-all context menu
 * offering a single action that opens the Tauri webview's devtools. Only renders
 * in a development Tauri build; everywhere else it's a transparent passthrough.
 *
 * Nested card menus win because their trigger stops propagation, so this fires
 * only on app chrome. Right-clicks on editable fields are let through (capture-
 * phase `stopPropagation`) so the native copy/paste menu still shows there.
 */
export function DevContextMenu({ children }: { children: ReactNode }) {
  // `isTauri()` is a runtime check that is false during SSR/prerender but true once
  // hydrating inside the Tauri webview. Rendering the wrapper on the first client
  // pass would diverge from the server HTML, so gate it behind a post-mount flag:
  // server + initial client both emit the passthrough, then we swap in the menu.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !DEV || !isTauri()) return <>{children}</>;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="contents"
          onContextMenuCapture={(e) => {
            if (isEditable(e.target)) e.stopPropagation();
          }}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {/* Raw Tauri shell invoke — NOT the app's `@/lib/tauri` invoke, which
            routes to the HTTP sidecar and would 404 on this shell-only command. */}
        <ContextMenuItem onSelect={() => void tauriInvoke("open_devtools")}>
          <TerminalIcon />
          Inspect Element
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

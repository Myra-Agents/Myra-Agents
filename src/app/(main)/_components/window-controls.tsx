"use client";

import { useEffect, useState } from "react";

import { Maximize2, Minimize2, Minus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/tauri";

async function getCurrentTauriWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Shared window-control state + actions for the custom (decoration-less) titlebar. */
function useWindowControls() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let unlistenResized: (() => void) | undefined;
    setIsAvailable(true);
    setIsMac(detectMac());

    getCurrentTauriWindow()
      .then(async (appWindow) => {
        // macOS uses the native Overlay title bar (real traffic lights, set in
        // tauri.conf.json). Windows/Linux stay decoration-less and use the
        // custom WindowControls rendered in the header.
        if (!detectMac()) {
          await appWindow.setDecorations(false);
        }

        const syncMaximized = () => {
          appWindow
            .isMaximized()
            .then((maximized) => {
              if (!disposed) setIsMaximized(maximized);
            })
            .catch((error) => {
              console.error("[window-controls] Failed to read maximized state", error);
            });
        };

        syncMaximized();
        unlistenResized = await appWindow.onResized(syncMaximized);
      })
      .catch((error) => {
        console.error("[window-controls] Failed to initialize window controls", error);
      });

    return () => {
      disposed = true;
      unlistenResized?.();
    };
  }, []);

  const minimize = async () => {
    try {
      const appWindow = await getCurrentTauriWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error("[window-controls] Failed to minimize window", error);
    }
  };

  const toggleMaximize = async () => {
    try {
      const appWindow = await getCurrentTauriWindow();
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    } catch (error) {
      console.error("[window-controls] Failed to toggle maximized state", error);
    }
  };

  const close = async () => {
    try {
      const appWindow = await getCurrentTauriWindow();
      await appWindow.close();
    } catch (error) {
      console.error("[window-controls] Failed to close window", error);
    }
  };

  return { isAvailable, isMac, isMaximized, minimize, toggleMaximize, close };
}

export function WindowDragRegion() {
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    const tauri = isTauri();
    setIsAvailable(tauri);
    if (!tauri) return;
    // Flag the document so CSS can round/clip the decoration-less, transparent
    // window — but only on Windows/Linux. macOS keeps native decorations (the
    // Overlay title bar with real traffic lights), so the OS draws the rounded
    // corners and shadow; the CSS hack would leave a transparent sliver there.
    if (detectMac()) return;
    document.documentElement.setAttribute("data-tauri", "true");
    return () => {
      document.documentElement.removeAttribute("data-tauri");
    };
  }, []);

  const startDragging = async () => {
    if (!isAvailable) return;

    try {
      const appWindow = await getCurrentTauriWindow();
      await appWindow.startDragging();
    } catch (error) {
      console.error("[window-controls] Failed to start window dragging", error);
    }
  };

  const toggleMaximize = async () => {
    if (!isAvailable) return;

    try {
      const appWindow = await getCurrentTauriWindow();
      await appWindow.toggleMaximize();
    } catch (error) {
      console.error("[window-controls] Failed to toggle maximized state", error);
    }
  };

  return (
    <div
      aria-hidden="true"
      className="h-full min-w-4 flex-1"
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        void startDragging();
      }}
      onDoubleClick={() => void toggleMaximize()}
    />
  );
}

/**
 * Reserves the top-left of the sidebar rail for the *native* macOS traffic
 * lights. The buttons themselves are real AppKit controls drawn by the Overlay
 * title bar (configured in `tauri.conf.json`: `titleBarStyle: "Overlay"`,
 * `hiddenTitle`, `trafficLightPosition`) — not HTML. This spacer just keeps the
 * sidebar content clear of them and stays draggable so the window can be moved
 * by grabbing the area around the native buttons. macOS + Tauri only.
 */
export function MacSidebarControls() {
  const { isAvailable, isMac, toggleMaximize } = useWindowControls();

  if (!isAvailable || !isMac) return null;

  const startDragging = async (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    try {
      const appWindow = await getCurrentTauriWindow();
      await appWindow.startDragging();
    } catch (error) {
      console.error("[window-controls] Failed to start window dragging", error);
    }
  };

  return (
    <div aria-hidden="true" className="h-9" onMouseDown={startDragging} onDoubleClick={() => void toggleMaximize()} />
  );
}

/** Windows/Linux window controls, rendered on the right of the header. Hidden on macOS. */
export function WindowControls() {
  const { isAvailable, isMac, isMaximized, minimize, toggleMaximize, close } = useWindowControls();

  if (!isAvailable || isMac) return null;

  return (
    <div className="flex items-center gap-1 border-l pl-2">
      <Button
        aria-label="Minimize window"
        className="text-muted-foreground hover:text-foreground"
        onClick={minimize}
        size="icon-sm"
        title="Minimize"
        type="button"
        variant="ghost"
      >
        <Minus />
      </Button>
      <Button
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
        className="text-muted-foreground hover:text-foreground"
        onClick={toggleMaximize}
        size="icon-sm"
        title={isMaximized ? "Restore" : "Maximize"}
        type="button"
        variant="ghost"
      >
        {isMaximized ? <Minimize2 /> : <Maximize2 />}
      </Button>
      <Button
        aria-label="Close window"
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={close}
        size="icon-sm"
        title="Close"
        type="button"
        variant="ghost"
      >
        <X />
      </Button>
    </div>
  );
}

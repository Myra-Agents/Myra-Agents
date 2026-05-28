"use client";

import { useEffect, useState } from "react";

import { Maximize2, Minimize2, Minus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/tauri";

const USE_NATIVE_WINDOW_FRAME = false;

async function getCurrentTauriWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export function WindowDragRegion() {
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    setIsAvailable(isTauri());
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

  return (
    <div
      aria-hidden="true"
      className="h-full min-w-4 flex-1"
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        void startDragging();
      }}
    />
  );
}

export function WindowControls() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let unlistenResized: (() => void) | undefined;
    setIsAvailable(true);

    getCurrentTauriWindow()
      .then(async (appWindow) => {
        await appWindow.setDecorations(USE_NATIVE_WINDOW_FRAME);

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

  if (!isAvailable) return null;

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

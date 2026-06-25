"use client";

import { useEffect, useState } from "react";

import { Maximize2, Minimize2, Minus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { isTauri } from "@/lib/tauri";

import { SearchButton } from "./sidebar/search-dialog";

async function getCurrentTauriWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

type Platform = "mac" | "windows" | "linux" | "other";

const VALID_PLATFORMS: Platform[] = ["mac", "windows", "linux", "other"];

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  // Dev override: localStorage.setItem('myra:dev:platform', 'windows') then reload
  if (process.env.NODE_ENV === "development" && typeof localStorage !== "undefined") {
    const override = localStorage.getItem("myra:dev:platform") as Platform | null;
    if (override && VALID_PLATFORMS.includes(override)) return override;
  }
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  if (/Linux/i.test(ua)) return "linux";
  return "other";
}

function detectMac(): boolean {
  return detectPlatform() === "mac";
}

/** Shared window-control state + actions for the custom (decoration-less) titlebar. */
function useWindowControls() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const p = detectPlatform();
    const hasDevOverride =
      process.env.NODE_ENV === "development" &&
      typeof localStorage !== "undefined" &&
      localStorage.getItem("myra:dev:platform") !== null;

    if (!isTauri() && !hasDevOverride) return;

    let disposed = false;
    let unlistenResized: (() => void) | undefined;
    setIsAvailable(true);
    setIsMac(p === "mac");
    setPlatform(p);

    if (!isTauri()) return;

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

  return { isAvailable, isMac, platform, isMaximized, minimize, toggleMaximize, close };
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
    <div
      aria-hidden="true"
      className="h-10 w-18 shrink-0"
      onMouseDown={startDragging}
      onDoubleClick={() => void toggleMaximize()}
    />
  );
}

/**
 * Keeps the content header clear of the native macOS traffic lights when the
 * sidebar is fully hidden (offcanvas collapsed) — without the sidebar rail the
 * lights would otherwise overlap the header's left controls. macOS + Tauri only.
 */
export function MacHeaderControlsSpacer() {
  const { isAvailable, isMac } = useWindowControls();
  const { state } = useSidebar();

  if (!isAvailable || !isMac) return null;
  // The docked, expanded sidebar hosts the lights itself; whenever it is
  // hidden they sit over the content header, so reserve their footprint here.
  if (state === "expanded") return null;

  // Lights span x:18 -> ~70px from the window edge; the header has 12px of
  // padding, so 72px here puts the first control at ~84px with clear margin.
  return <div aria-hidden="true" className="w-18 shrink-0" />;
}

/**
 * Top-bar collapse + search cluster. Shown only while the sidebar is collapsed:
 * when expanded the sidebar hosts its own copy of these controls (see
 * AppSidebar), so the top bar stays empty there. On a narrow window hovering the
 * trigger opens the peek overlay; leaving the panel closes it.
 */
export function HeaderLeftControls() {
  const { state, isNarrow, peek, setPeek } = useSidebar();

  if (state === "expanded") return null;

  return (
    <div className="flex items-center gap-1">
      <SidebarTrigger
        className="text-icon-primary hover:text-foreground"
        onMouseEnter={() => {
          if (isNarrow && !peek) setPeek(true);
        }}
      />
      <SearchButton className="text-icon-primary hover:text-foreground" />
    </div>
  );
}

/** Windows 11-style controls: full-height flat buttons, red hover on close. */
function WindowControlsWindows({
  isMaximized,
  minimize,
  toggleMaximize,
  close,
}: {
  isMaximized: boolean;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
}) {
  return (
    <div className="flex h-full items-stretch">
      <button
        aria-label="Minimize window"
        className="flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={minimize}
        title="Minimize"
        type="button"
      >
        <Minus className="h-3 w-3" strokeWidth={1.5} />
      </button>
      <button
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
        className="flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={toggleMaximize}
        title={isMaximized ? "Restore" : "Maximize"}
        type="button"
      >
        {isMaximized ? (
          <Minimize2 className="h-3 w-3" strokeWidth={1.5} />
        ) : (
          <Maximize2 className="h-3 w-3" strokeWidth={1.5} />
        )}
      </button>
      <button
        aria-label="Close window"
        className="flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-red-500 hover:text-white"
        onClick={close}
        title="Close"
        type="button"
      >
        <X className="h-3 w-3" strokeWidth={1.5} />
      </button>
    </div>
  );
}

/** Linux (GNOME-style) controls: colored circles on the right. */
function WindowControlsLinux({
  isMaximized,
  minimize,
  toggleMaximize,
  close,
}: {
  isMaximized: boolean;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 pl-2">
      <button
        aria-label="Minimize window"
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full transition-opacity hover:opacity-80 active:opacity-60"
        onClick={minimize}
        style={{ background: "#e5a50a" }}
        title="Minimize"
        type="button"
      />
      <button
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full transition-opacity hover:opacity-80 active:opacity-60"
        onClick={toggleMaximize}
        style={{ background: "#33d17a" }}
        title={isMaximized ? "Restore" : "Maximize"}
        type="button"
      />
      <button
        aria-label="Close window"
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full transition-opacity hover:opacity-80 active:opacity-60"
        onClick={close}
        style={{ background: "#f66151" }}
        title="Close"
        type="button"
      />
    </div>
  );
}

/** Window controls rendered on the right of the header. Hidden on macOS. */
export function WindowControls() {
  const { isAvailable, isMac, platform, isMaximized, minimize, toggleMaximize, close } = useWindowControls();

  if (!isAvailable || isMac) return null;

  if (platform === "windows") {
    return (
      <WindowControlsWindows
        isMaximized={isMaximized}
        minimize={minimize}
        toggleMaximize={toggleMaximize}
        close={close}
      />
    );
  }

  if (platform === "linux") {
    return (
      <WindowControlsLinux
        isMaximized={isMaximized}
        minimize={minimize}
        toggleMaximize={toggleMaximize}
        close={close}
      />
    );
  }

  // Fallback générique (autre OS)
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

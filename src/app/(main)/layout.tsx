import type { ReactNode } from "react";

import { AppSidebar } from "@/app/(main)/_components/sidebar/app-sidebar";
// User connection disabled — auth bootstrap + remote-access consent are off.
// import { AuthBootstrap } from "@/components/auth-bootstrap";
import { RequirePro } from "@/components/require-pro";
// import { RemoteAccessConsent } from "@/components/settings/remote-access-consent";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { cn } from "@/lib/utils";

import { GlobalShortcuts } from "./_components/global-shortcuts";
// Theme/layout preferences popover removed — theme is changed from Settings → Preferences.
// import { LayoutControls } from "./_components/sidebar/layout-controls";
import { SearchDialog } from "./_components/sidebar/search-dialog";
import { ThemeSwitcher } from "./_components/sidebar/theme-switcher";
import { MacHeaderControlsSpacer, WindowControls, WindowDragRegion } from "./_components/window-controls";

// Static export (Tauri desktop) build: no server-side cookies. Use defaults;
// client-side PreferencesStoreProvider hydrates from document.cookie afterwards.
export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const defaultOpen = true;
  const variant = PREFERENCE_DEFAULTS.sidebar_variant;
  const collapsible = PREFERENCE_DEFAULTS.sidebar_collapsible;

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      className="min-h-[calc(100svh_-_var(--titlebar-h,0px))] pt-[var(--titlebar-h,0px)]"
      style={
        {
          // Linear-style narrow sidebar.
          "--sidebar-width": "15rem",
          // Wide enough for the macOS traffic lights to sit inside the rail
          // when the sidebar is collapsed (WhatsApp-style).
          "--sidebar-width-icon": "4.5rem",
        } as React.CSSProperties
      }
    >
      <GlobalShortcuts />
      <AppSidebar variant={variant} collapsible={collapsible} />
      <SidebarInset
        className={cn(
          "[html[data-content-layout=centered]_&>*]:mx-auto",
          "[html[data-content-layout=centered]_&>*]:w-full",
          "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
          "peer-data-[variant=inset]:border",
          // Bound the inset height so vertical overflow scrolls *inside* the
          // inset (scrollbar within the rounded border) instead of the body.
          "h-[calc(100svh_-_var(--titlebar-h,0px))] overflow-hidden peer-data-[variant=inset]:h-[calc(100svh_-_var(--titlebar-h,0px)_-_--spacing(4))]",
        )}
      >
        <header
          className={cn(
            "flex h-10 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-10",
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
          )}
        >
          <div className="flex h-full w-full items-center gap-2 px-3">
            <div className="flex items-center gap-2">
              <MacHeaderControlsSpacer />
              <SidebarTrigger />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              <SearchDialog />
            </div>
            <WindowDragRegion />
            <div className="flex items-center gap-2">
              {/* <LayoutControls /> */}
              <ThemeSwitcher />
              <WindowControls />
            </div>
          </div>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0">
          <RequirePro>{children}</RequirePro>
        </div>
      </SidebarInset>
      {/* User connection disabled — <AuthBootstrap /> and <RemoteAccessConsent /> removed. */}
    </SidebarProvider>
  );
}

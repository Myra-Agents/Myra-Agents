import type { ReactNode } from "react";

import { AppSidebar } from "@/app/(main)/_components/sidebar/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { cn } from "@/lib/utils";

import { GlobalShortcuts } from "./_components/global-shortcuts";
import { LayoutControls } from "./_components/sidebar/layout-controls";
import { SearchDialog } from "./_components/sidebar/search-dialog";
import { ThemeSwitcher } from "./_components/sidebar/theme-switcher";
import { WindowControls, WindowDragRegion } from "./_components/window-controls";

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
          "--sidebar-width": "calc(var(--spacing) * 68)",
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
        )}
      >
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
          )}
        >
          <div className="flex h-full w-full items-center gap-3 px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              <SearchDialog />
            </div>
            <WindowDragRegion />
            <div className="flex items-center gap-2">
              <LayoutControls />
              <ThemeSwitcher />
              <WindowControls />
            </div>
          </div>
        </header>
        <div className="h-full min-w-0 overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

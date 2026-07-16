import type { ReactNode } from "react";

import { AppSidebar } from "@/app/(main)/_components/sidebar/app-sidebar";
// User connection disabled — auth bootstrap + remote-access consent are off.
// import { AuthBootstrap } from "@/components/auth-bootstrap";
import { RequirePro } from "@/components/require-pro";
// import { RemoteAccessConsent } from "@/components/settings/remote-access-consent";
import { SpotlightTour } from "@/components/tour/spotlight-tour";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { cn } from "@/lib/utils";

import { AgentTestBootstrap } from "./_components/agent-test-bootstrap";
import { AppUpdateBootstrap } from "./_components/app-update-bootstrap";
import { GlobalShortcuts } from "./_components/global-shortcuts";
import { HEADER_ACTIONS_ID } from "./_components/header-actions";
import { HeaderBreadcrumb } from "./_components/header-breadcrumb";
import { NavHistoryControls } from "./_components/nav-history-controls";
import { OnboardingBootstrap } from "./_components/onboarding/onboarding-bootstrap";
import { RefreshOnNavigate } from "./_components/refresh-on-navigate";
import { RunStartedToasts } from "./_components/run-started-toasts";
// Theme/layout preferences popover removed — theme is changed from Settings → Preferences.
// import { LayoutControls } from "./_components/sidebar/layout-controls";
import { SearchDialog } from "./_components/sidebar/search-dialog";
import { ThemeSwitcher } from "./_components/sidebar/theme-switcher";
import { TourBootstrap } from "./_components/tour-bootstrap";
import { TrayActionListener } from "./_components/tray-action-listener";
import {
  HeaderLeftControls,
  MacHeaderControlsSpacer,
  WindowControls,
  WindowDragRegion,
} from "./_components/window-controls";

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
      {/* Desktop-only silent update probe → toast on a newer signed build. */}
      <AppUpdateBootstrap />
      {/* One-shot auto connectivity test for installed-but-never-tested agents. */}
      <AgentTestBootstrap />
      {/* First-run onboarding wizard (localStorage-gated, shows once). */}
      <OnboardingBootstrap />
      {/* Hydrates the "Get started" checklist and ticks it as routes are visited.
          The card itself lives in the sidebar footer. */}
      <TourBootstrap />
      {/* Spotlight walkthrough — renders only while a checklist flow is running. */}
      <SpotlightTour />
      <TrayActionListener />
      {/* Global "Operation started" toast for every run start (manual or scheduled). */}
      <RunStartedToasts />
      {/* Silent re-fetch of board + schedules on every route change. */}
      <RefreshOnNavigate />
      {/* Single dialog instance; triggered from either the sidebar or top-bar SearchButton. */}
      <SearchDialog />
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
          <div className="flex h-full w-full items-center gap-2 pl-3">
            <div className="flex items-center gap-2">
              <MacHeaderControlsSpacer />
              <HeaderLeftControls />
              <NavHistoryControls />
            </div>
            <WindowDragRegion />
            {/* Centered breadcrumb — flanked by drag regions so it stays centered. */}
            <HeaderBreadcrumb />
            <WindowDragRegion />
            <div className="flex items-center gap-2 pr-3">
              {/* Per-page action slot (e.g. Runs' List/Kanban toggle) portals here. */}
              <div id={HEADER_ACTIONS_ID} className="flex items-center gap-2" />
              <ThemeSwitcher className="text-icon-primary hover:text-foreground" />
              {/* <LayoutControls /> */}
            </div>
            <WindowControls />
          </div>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <RequirePro>{children}</RequirePro>
        </div>
      </SidebarInset>
      {/* User connection disabled — <AuthBootstrap /> and <RemoteAccessConsent /> removed. */}
    </SidebarProvider>
  );
}

"use client";

import Link from "next/link";

import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { MacSidebarControls } from "../window-controls";
import { NavMain } from "./nav-main";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <Sidebar
      {...props}
      variant={variant}
      collapsible={collapsible}
      className="md:!top-[var(--titlebar-h,0px)] md:!h-[calc(100svh_-_var(--titlebar-h,0px))]"
    >
      <SidebarHeader>
        <MacSidebarControls />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:[&_img]:!size-6"
            >
              <Link prefetch={false} href="/kanban">
                <img
                  src="/light-theme.png"
                  alt=""
                  aria-hidden
                  className="size-5 object-contain dark:hidden"
                />
                <img
                  src="/dark-theme.png"
                  alt=""
                  aria-hidden
                  className="hidden size-5 object-contain dark:block"
                />
                <span className="font-semibold text-base">{APP_CONFIG.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <div className="px-3 py-2 text-xs text-muted-foreground">
          v{APP_CONFIG.version}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

"use client";

import Link from "next/link";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { MacSidebarControls } from "../window-controls";
import { NavMain } from "./nav-main";
import { SearchButton } from "./search-dialog";
// import { NavUser } from "./nav-user";
import { SidebarSupportCard } from "./sidebar-support-card";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations("nav");

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
      {/* Same geometry as the content header row (px-3 + w-18 spacer + gap-2)
          so the rail top lines up with the header. No toggle here: the peek
          closes on mouse-out (and ⌘B still works everywhere). */}
      <div className="flex h-10 shrink-0 items-center gap-2 pl-3">
        <MacSidebarControls />
        {/* Collapse + search live here while the sidebar is open; when collapsed
            (offcanvas) the rail is gone and the top bar shows them instead.
            Hidden in the narrow icon rail to keep it clean. */}
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
          <SidebarTrigger />
          <SearchButton />
        </div>
      </div>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-auto cursor-default hover:bg-transparent hover:text-sidebar-foreground active:bg-transparent active:text-sidebar-foreground group-data-[collapsible=icon]:!size-12 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:[&>div]:gap-0 group-data-[collapsible=icon]:[&_span]:hidden group-data-[collapsible=icon]:[&_img]:!size-11"
            >
              <div className="flex items-center justify-center gap-2 text-sidebar-foreground">
                <img src="/logo-light.png" alt="" aria-hidden className="size-8 object-contain dark:hidden" />
                <img src="/logo-dark.png" alt="" aria-hidden className="hidden size-8 object-contain dark:block" />
                <span className="font-semibold text-lg" style={{ fontFamily: "var(--font-sorts-mill-goudy)" }}>
                  {APP_CONFIG.name}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarSupportCard />
        {/* <NavUser /> — masqué pour le moment; restaurer en décommentant (voir nav-user.tsx) */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip={t("account.settings")}
              className="group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:[&>span]:hidden"
            >
              <Link prefetch={false} href="/settings">
                <Settings />
                <span>{t("account.settings")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-3 pb-1 text-center text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          v{APP_CONFIG.version}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

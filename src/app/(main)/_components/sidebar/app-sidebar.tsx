"use client";

import { useRouter } from "next/navigation";

import { Plus } from "lucide-react";
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
import { useShortcutStore } from "@/stores/shortcut-store";

import { MacSidebarControls } from "../window-controls";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { SidebarSupportCard } from "./sidebar-support-card";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations("nav");
  const router = useRouter();
  const requestNewCard = useShortcutStore((s) => s.requestNewCard);

  const handleNewCard = () => {
    router.push("/kanban");
    requestNewCard();
  };

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
      <div className="flex h-10 shrink-0 items-center pl-2">
        <MacSidebarControls />
        <SidebarTrigger />
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
        <SidebarMenu className="px-2 pt-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleNewCard}
              tooltip={t("newCard")}
              className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:[&>span]:hidden group-data-[collapsible=icon]:[&>svg]:!size-6"
            >
              <Plus />
              <span>{t("newCard")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarSupportCard />
        <NavUser />
        <div className="px-3 pb-1 text-center text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          v{APP_CONFIG.version}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

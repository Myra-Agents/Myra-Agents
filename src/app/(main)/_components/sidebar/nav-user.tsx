"use client";

import Link from "next/link";

import { CircleUser, EllipsisVertical, Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { getInitials } from "@/lib/utils";

/**
 * Sidebar footer row. The user connection (sign in/out + account identity) was
 * removed — this is now a static, local-only entry that just carries the menu to
 * Settings. Restore the `useAuth`-driven account row from git history to bring
 * back sign-in/out.
 */
export function NavUser() {
  const t = useTranslations("nav.account");
  const { isMobile } = useSidebar();

  const name = APP_CONFIG.name;
  const subtitle = t("account");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:[&>div]:hidden group-data-[collapsible=icon]:[&>svg]:hidden"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage src={undefined} alt={name} />
                <AvatarFallback className="rounded-lg">{getInitials(name)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium capitalize">{name}</span>
                <span className="truncate text-muted-foreground text-xs">{subtitle}</span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{getInitials(name)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium capitalize">{name}</span>
                  <span className="truncate text-muted-foreground text-xs">{subtitle}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link prefetch={false} href="/settings">
                  <CircleUser />
                  {t("account")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link prefetch={false} href="/settings">
                  <Settings />
                  {t("settings")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

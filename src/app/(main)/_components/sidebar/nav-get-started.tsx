"use client";

import { useMemo } from "react";

import Link from "next/link";

import { ActivityIcon, CheckIcon, HistoryIcon, RouteIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSchedules } from "@/hooks/use-schedules";
import { TOUR_ROUTES } from "@/lib/tour.client";
import { cn } from "@/lib/utils";
import { useTourStore } from "@/stores/tour-store";

/**
 * The "Get started" checklist — the guided tour, as a sidebar section rather
 * than a modal spotlight: it stays out of the way, survives a reload, and lets
 * the user do the steps in any order (or none).
 *
 * Every step's done-ness is derived from what actually happened — a visited
 * route, or a patrol that really exists — never from a "next" click, so the
 * checklist can't congratulate the user for work they didn't do.
 *
 * Shown only when the tour is on (opted in at the end of onboarding, or
 * replayed from Settings), and auto-hidden once every step is ticked.
 */
export function NavGetStarted() {
  const t = useTranslations("tour");
  const { enabled, hydrated, visited, stop } = useTourStore();
  const { schedules } = useSchedules();

  const steps = useMemo(
    () => [
      {
        id: "explore",
        icon: ActivityIcon,
        href: TOUR_ROUTES.runs,
        // Ticks only once all three views have been seen at least once.
        done: [TOUR_ROUTES.runs, TOUR_ROUTES.schedules, TOUR_ROUTES.history].every((r) => visited.includes(r)),
      },
      {
        id: "patrol",
        icon: RouteIcon,
        href: TOUR_ROUTES.schedules,
        // Real state: a patrol exists on some server, however it got created.
        done: schedules.length > 0,
      },
      {
        id: "run",
        icon: HistoryIcon,
        href: TOUR_ROUTES.history,
        // The run detail is unreachable without a run, so a visit proves both.
        done: visited.includes(TOUR_ROUTES.runDetail),
      },
    ],
    [visited, schedules.length],
  );

  const doneCount = steps.filter((s) => s.done).length;

  // Wait for hydration so the static export doesn't flash the checklist at
  // users who never opted in.
  if (!hydrated || !enabled) return null;
  // Nothing left to guide — fold it away rather than leave a 3/3 trophy.
  if (doneCount === steps.length) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="justify-between">
        <span>{t("title")}</span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground tabular-nums">
            {doneCount}/{steps.length}
          </span>
          <button
            type="button"
            onClick={stop}
            aria-label={t("dismiss")}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {steps.map((step) => (
            <SidebarMenuItem key={step.id}>
              <SidebarMenuButton
                asChild
                tooltip={{ hidden: false, children: t(`steps.${step.id}.hint`) }}
                className={cn("gap-2", step.done && "text-muted-foreground")}
              >
                <Link prefetch={false} href={step.href}>
                  {step.done ? (
                    <CheckIcon className="size-4 text-green-600 dark:text-green-500" />
                  ) : (
                    <step.icon className="size-4" />
                  )}
                  <span className={cn(step.done && "line-through")}>{t(`steps.${step.id}.title`)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

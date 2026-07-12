"use client";

import Link from "next/link";

import { CalendarDaysIcon, ListIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * The List ↔ Calendar segmented control shown in the Patrols header (issue #181:
 * "onglet à côté de la vue liste"). Each view is its own route — `/schedules`
 * (list) and `/schedules/calendar` — so it's a pair of links, not local state,
 * and deep-links / the back button behave.
 */
export function SchedulesViewSwitcher({ active }: { active: "list" | "calendar" }) {
  const t = useTranslations("schedules");
  const base = "flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors";
  const on = "bg-secondary text-text-primary";
  const off = "text-text-tertiary hover:text-text-secondary";
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border-cards bg-card-background p-0.5">
      <Link prefetch={false} href="/schedules" className={cn(base, active === "list" ? on : off)}>
        <ListIcon className="size-3.5 shrink-0" />
        {t("calendar.viewList")}
      </Link>
      <Link prefetch={false} href="/schedules/calendar" className={cn(base, active === "calendar" ? on : off)}>
        <CalendarDaysIcon className="size-3.5 shrink-0" />
        {t("calendar.viewCalendar")}
      </Link>
    </div>
  );
}

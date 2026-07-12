"use client";

import { useTranslations } from "next-intl";

import { HeaderActions } from "@/app/(main)/_components/header-actions";
import { ScheduleCalendar } from "@/components/schedules/schedule-calendar";
import { SchedulesViewSwitcher } from "@/components/schedules/schedules-view-switcher";
import { useKanban } from "@/hooks/use-kanban";
import { useSchedules } from "@/hooks/use-schedules";

/**
 * Calendar view of scheduled patrols (issue #181). A month / week / day grid of
 * every schedule's upcoming fire times — occurrences expanded client-side from
 * each schedule's cron/interval/daily/weekly kind — coloured by last-run status,
 * with per-schedule stats (duration · cost · success rate) on hover. Sits beside
 * the list view under `/schedules/calendar`; the header switcher toggles between
 * the two.
 */
export default function SchedulesCalendarPage() {
  const t = useTranslations("schedules");
  const { schedules, loading } = useSchedules();
  // Cards carry the run history the calendar overlays as per-schedule stats +
  // last-run colour; the board store live-refreshes them, so no wiring needed.
  const { cards } = useKanban();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-tertiary text-sm">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1160px] flex-col">
      <HeaderActions>
        <SchedulesViewSwitcher active="calendar" />
      </HeaderActions>

      <div className="flex flex-col pl-1.5">
        <h1 className="text-text-primary text-base font-medium">{t("title")}</h1>
        <p className="text-text-secondary text-xs font-light">{t("calendar.subtitle")}</p>
      </div>

      <div className="mt-6">
        <ScheduleCalendar schedules={schedules} cards={cards} />
      </div>
    </div>
  );
}

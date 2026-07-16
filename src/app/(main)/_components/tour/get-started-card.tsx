"use client";

import { useMemo } from "react";

import { ActivityIcon, CheckIcon, HistoryIcon, RouteIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useSchedules } from "@/hooks/use-schedules";
import { TOUR_ROUTES, type TourStepId } from "@/lib/tour.client";
import { cn } from "@/lib/utils";
import { useTourStore } from "@/stores/tour-store";

/**
 * The "Get started" checklist — the guided tour, as a floating card in the
 * bottom-right corner rather than a modal: it stays out of the way, survives a
 * reload, and lets the user do the steps in any order (or none).
 *
 * Every step's done-ness is derived from what actually happened — a visited
 * route, or a patrol that really exists — never from a "next" click, so the
 * checklist can't congratulate the user for work they didn't do.
 *
 * Clicking a line runs its spotlight walkthrough (<SpotlightTour />). The card
 * sits below the spotlight's overlay so it dims along with the rest of the app
 * while a walkthrough is running.
 *
 * Shown only when the tour is on (opted in at the end of onboarding, or
 * replayed from Settings), and auto-hidden once every step is ticked.
 */
export function GetStartedCard() {
  const t = useTranslations("tour");
  const { enabled, hydrated, visited, stop, startFlow } = useTourStore();
  const { schedules } = useSchedules();

  const steps = useMemo(
    () => [
      {
        id: "explore" as TourStepId,
        icon: ActivityIcon,
        // Ticks only once all three views have been seen at least once.
        done: [TOUR_ROUTES.runs, TOUR_ROUTES.schedules, TOUR_ROUTES.history].every((r) => visited.includes(r)),
      },
      {
        id: "patrol" as TourStepId,
        icon: RouteIcon,
        // Real state: a patrol exists on some server, however it got created.
        done: schedules.length > 0,
      },
      {
        id: "run" as TourStepId,
        icon: HistoryIcon,
        // The run detail is unreachable without a run, so a visit proves both.
        done: visited.includes(TOUR_ROUTES.runDetail),
      },
    ],
    [visited, schedules.length],
  );

  const doneCount = steps.filter((s) => s.done).length;

  // Wait for hydration so the static export doesn't flash the card at users who
  // never opted in.
  if (!hydrated || !enabled) return null;
  // Nothing left to guide — fold it away rather than leave a 3/3 trophy.
  if (doneCount === steps.length) return null;

  return (
    <Card size="sm" className="fixed right-4 bottom-4 z-40 w-72 shadow-md">
      <button
        type="button"
        onClick={stop}
        aria-label={t("dismiss")}
        className="absolute top-2 right-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          {t("title")}
          <span className="font-normal text-muted-foreground text-xs tabular-nums">
            {doneCount}/{steps.length}
          </span>
        </CardTitle>
        <div className="mt-2 flex flex-col gap-0.5">
          {steps.map((step) => (
            // A line is the entry point to its spotlight walkthrough: the card
            // is the menu, the spotlight is the execution.
            <button
              key={step.id}
              type="button"
              onClick={() => startFlow(step.id)}
              title={t(`steps.${step.id}.hint`)}
              className={cn(
                "-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                step.done && "text-muted-foreground",
              )}
            >
              {step.done ? (
                <CheckIcon className="size-4 shrink-0 text-green-600 dark:text-green-500" />
              ) : (
                <step.icon className="size-4 shrink-0" />
              )}
              <span className={cn(step.done && "line-through")}>{t(`steps.${step.id}.title`)}</span>
            </button>
          ))}
        </div>
      </CardHeader>
    </Card>
  );
}

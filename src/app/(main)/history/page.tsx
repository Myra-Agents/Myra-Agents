"use client";

import { useTranslations } from "next-intl";

import { RunsHistory } from "@/components/history/runs-history";
import { useKanban } from "@/hooks/use-kanban";

/**
 * "History" view from the new UI refactor (Figma `history`). Past runs of every
 * schedule — finished, succeeded or failed — with at-a-glance stats. The page
 * supplies the title; the shared {@link RunsHistory} renders the time-range
 * selector, stat cards, trend graphs and the searchable/sortable run table (also
 * reused by the schedule editor's "Runs & History" tab).
 */
export default function HistoryPage() {
  const t = useTranslations("history");
  const { cards, loading, error } = useKanban();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-tertiary">{t("loading")}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  return (
    // Figma "App" content width — 968px, centered in the window.
    <div className="mx-auto flex w-full max-w-[968px] flex-col">
      <div className="flex flex-col pb-4 pl-1.5">
        <h1 className="font-medium text-base text-text-primary">{t("title")}</h1>
        <p className="font-light text-text-secondary text-xs">{t("subtitle")}</p>
      </div>
      <RunsHistory cards={cards} />
    </div>
  );
}

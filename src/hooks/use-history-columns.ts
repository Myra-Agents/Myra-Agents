"use client";

import { makeColumnVisibilityHook } from "./use-column-visibility";

/** Columns the user can show/hide in the History / Operations & History table.
 *  The "task" (operation name) column is the row's anchor and stays pinned. */
export type HistoryColumnId = "triggered" | "ended" | "duration" | "agent" | "result" | "usage";

export const TOGGLEABLE_COLUMNS: HistoryColumnId[] = ["triggered", "ended", "duration", "agent", "result", "usage"];

export const useHistoryColumns = makeColumnVisibilityHook("myra-agents-history-columns", TOGGLEABLE_COLUMNS);

"use client";

import { makeColumnVisibilityHook } from "./use-column-visibility";

/** Columns the user can show/hide in the Operations (Runs) list table. The
 *  "task" (operation name) column is the row's anchor and stays pinned. */
export type RunsColumnId = "triggered" | "status" | "duration" | "agent";

export const TOGGLEABLE_COLUMNS: RunsColumnId[] = ["triggered", "status", "duration", "agent"];

export const useRunsColumns = makeColumnVisibilityHook("myra-agents-runs-columns", TOGGLEABLE_COLUMNS);

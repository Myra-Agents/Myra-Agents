import type { ColumnConfig, KanbanStatus } from "@/types/kanban";
import { COLUMN_CONFIG } from "@/types/kanban";

const UNKNOWN_COLUMN_CONFIG: ColumnConfig = {
  label: "Unknown",
  accentBar: "bg-slate-500",
};

export function columnConfigFor(status: KanbanStatus | string | null | undefined): ColumnConfig {
  if (typeof status === "string" && status in COLUMN_CONFIG) {
    return COLUMN_CONFIG[status as KanbanStatus];
  }

  if (typeof status === "string") {
    const label = status.trim().replace(/[_-]+/g, " ");
    if (label) return { ...UNKNOWN_COLUMN_CONFIG, label };
  }

  return UNKNOWN_COLUMN_CONFIG;
}

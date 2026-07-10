import { type KanbanCard, type KanbanStatus, STATUSES } from "@/types/kanban";

const KANBAN_STATUSES = new Set<string>(STATUSES);

export function isKanbanStatus(value: unknown): value is KanbanStatus {
  return typeof value === "string" && KANBAN_STATUSES.has(value);
}

export function normalizeKanbanStatus(value: unknown): KanbanStatus {
  return isKanbanStatus(value) ? value : "todo";
}

export function normalizeCardStatus(card: KanbanCard): KanbanCard {
  const status = normalizeKanbanStatus(card.status);
  return status === card.status ? card : { ...card, status };
}

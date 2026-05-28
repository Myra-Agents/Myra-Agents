import type { CreateCardInput, KanbanCard, KanbanStatus, UpdateCardInput } from "@/types/kanban";
import type { CreateScheduleInput, ScheduledTask, ScheduleKind, UpdateScheduleInput } from "@/types/schedule";
import type { AppSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";

const CARDS_KEY = "myra-agents.dev.cards";
const SETTINGS_KEY = "myra-agents.dev.settings";
const SCHEDULES_KEY = "myra-agents.dev.schedules";

const memoryStore = new Map<string, string>();
let warnedMemoryStore = false;

type CommandArgs = Record<string, unknown> | undefined;
type RevisionInput = { id: string; note: string };
type FeedbackInput = { id: string; answer: string };

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch (error) {
    if (!warnedMemoryStore) {
      console.warn("Browser dev backend could not access localStorage; falling back to in-memory storage.", error);
      warnedMemoryStore = true;
    }
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  const raw = browserStorage()?.getItem(key) ?? memoryStore.get(key);
  if (!raw) return fallback;

  return JSON.parse(raw) as T;
}

function writeJson<T>(key: string, value: T) {
  const raw = JSON.stringify(value);
  const storage = browserStorage();

  if (storage) {
    storage.setItem(key, raw);
  } else {
    memoryStore.set(key, raw);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function commandError(cmd: string, message: string): Error {
  return new Error(`[Browser Dev Backend] ${cmd}: ${message}`);
}

function requireObject<T extends object>(cmd: string, args: CommandArgs, key: string): T {
  const value = args?.[key];
  if (!isRecord(value)) {
    throw commandError(cmd, `missing object argument "${key}"`);
  }
  return value as T;
}

function requireString(cmd: string, args: CommandArgs, key: string): string {
  const value = args?.[key];
  if (typeof value !== "string") {
    throw commandError(cmd, `missing string argument "${key}"`);
  }
  return value;
}

function optionalString(args: CommandArgs, key: string): string | undefined {
  const value = args?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function newId(prefix = ""): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}${id}`;
}

function loadCards(): KanbanCard[] {
  const cards = readJson<KanbanCard[]>(CARDS_KEY, []);
  let changed = false;
  const counters = new Map<KanbanStatus, number>();

  for (const card of cards) {
    if (!card.position) {
      const next = (counters.get(card.status) ?? 0) + 1000;
      counters.set(card.status, next);
      card.position = next;
      changed = true;
    }
  }

  if (changed) saveCards(cards);
  return cards;
}

function saveCards(cards: KanbanCard[]) {
  writeJson(CARDS_KEY, cards);
}

function nextPositionFor(cards: KanbanCard[], status: KanbanStatus): number {
  return Math.max(0, ...cards.filter((card) => card.status === status).map((card) => card.position ?? 0)) + 1000;
}

function addCard(args: CommandArgs): KanbanCard {
  const input = requireObject<CreateCardInput>("add_card", args, "input");
  const cards = loadCards();
  const now = new Date().toISOString();
  const card: KanbanCard = {
    id: newId(),
    title: input.title,
    description: input.description ?? "",
    status: input.status,
    createdAt: now,
    updatedAt: now,
    agentPrompt: input.agentPrompt,
    linkedTaskId: input.linkedTaskId,
    tags: input.tags,
    position: nextPositionFor(cards, input.status),
    agentPresetId: input.agentPresetId,
    revisionNotes: [],
    runHistory: [],
  };

  saveCards([...cards, card]);
  return card;
}

function updateCard(args: CommandArgs): KanbanCard | null {
  const input = requireObject<UpdateCardInput>("update_card", args, "input");
  const cards = loadCards();
  const idx = cards.findIndex((card) => card.id === input.id);
  if (idx === -1) return null;

  const updated: KanbanCard = {
    ...cards[idx],
    title: input.title,
    description: input.description ?? "",
    agentPrompt: input.agentPrompt,
    agentPresetId: input.agentPresetId,
    tags: input.tags,
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  saveCards(cards);
  return updated;
}

function moveCard(args: CommandArgs): KanbanCard | null {
  const id = requireString("move_card", args, "id");
  const status = requireString("move_card", args, "status") as KanbanStatus;
  const cards = loadCards();
  const idx = cards.findIndex((card) => card.id === id);
  if (idx === -1) return null;

  const changedColumn = cards[idx].status !== status;
  const updated: KanbanCard = {
    ...cards[idx],
    status,
    position: changedColumn ? nextPositionFor(cards, status) : cards[idx].position,
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  saveCards(cards);
  return updated;
}

function reorderCard(args: CommandArgs): KanbanCard | null {
  const id = requireString("reorder_card", args, "id");
  const newPosition = args?.newPosition;
  if (typeof newPosition !== "number") {
    throw commandError("reorder_card", 'missing number argument "newPosition"');
  }

  const status = optionalString(args, "status") as KanbanStatus | undefined;
  const cards = loadCards();
  const idx = cards.findIndex((card) => card.id === id);
  if (idx === -1) return null;

  cards[idx] = {
    ...cards[idx],
    ...(status ? { status } : {}),
    position: newPosition,
    updatedAt: new Date().toISOString(),
  };
  saveCards(cards);
  return cards[idx];
}

function deleteCard(args: CommandArgs): boolean {
  const id = requireString("delete_card", args, "id");
  const cards = loadCards();
  const next = cards.filter((card) => card.id !== id);
  saveCards(next);
  return next.length < cards.length;
}

function trashCard(args: CommandArgs): KanbanCard | null {
  const id = requireString("trash_card", args, "id");
  const cards = loadCards();
  const idx = cards.findIndex((card) => card.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const card = cards[idx];
  const updated: KanbanCard = {
    ...card,
    previousStatus: card.status === "trashed" ? card.previousStatus : card.status,
    status: "trashed",
    deletedAt: now,
    updatedAt: now,
  };
  cards[idx] = updated;
  saveCards(cards);
  return updated;
}

function restoreCard(args: CommandArgs): KanbanCard | null {
  const id = requireString("restore_card", args, "id");
  const requestedStatus = optionalString(args, "status") as KanbanStatus | undefined;
  const cards = loadCards();
  const idx = cards.findIndex((card) => card.id === id);
  if (idx === -1) return null;

  const status = requestedStatus ?? cards[idx].previousStatus ?? "todo";
  const updated: KanbanCard = {
    ...cards[idx],
    status,
    position: nextPositionFor(cards, status),
    deletedAt: undefined,
    previousStatus: undefined,
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  saveCards(cards);
  return updated;
}

function addRevisionNote(args: CommandArgs): KanbanCard | null {
  const input = requireObject<RevisionInput>("add_revision_note", args, "input");
  const cards = loadCards();
  const idx = cards.findIndex((card) => card.id === input.id);
  if (idx === -1) return null;

  const updated: KanbanCard = {
    ...cards[idx],
    revisionNotes: [...(cards[idx].revisionNotes ?? []), input.note],
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  saveCards(cards);
  return updated;
}

function answerFeedback(args: CommandArgs): KanbanCard | null {
  const input = requireObject<FeedbackInput>("answer_feedback", args, "input");
  const cards = loadCards();
  const idx = cards.findIndex((card) => card.id === input.id);
  if (idx === -1) return null;

  const updated: KanbanCard = {
    ...cards[idx],
    agentQuestion: undefined,
    revisionNotes: [...(cards[idx].revisionNotes ?? []), `Answer to agent question: ${input.answer}`],
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  saveCards(cards);
  return updated;
}

function getSettings(): AppSettings {
  return readJson<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
}

function saveSettings(args: CommandArgs): AppSettings {
  const settings = requireObject<AppSettings>("save_settings", args, "settings");
  writeJson(SETTINGS_KEY, settings);
  return settings;
}

function loadSchedules(): ScheduledTask[] {
  return readJson<ScheduledTask[]>(SCHEDULES_KEY, []);
}

function saveSchedules(schedules: ScheduledTask[]) {
  writeJson(SCHEDULES_KEY, schedules);
}

function parseTime(value: string): { hours: number; minutes: number } | null {
  const [hours, minutes] = value.split(":").map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return { hours, minutes };
}

function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function dateAtTime(base: Date, value: string): Date | null {
  const parsed = parseTime(value);
  if (!parsed) return null;

  const date = new Date(base);
  date.setHours(parsed.hours, parsed.minutes, 0, 0);
  return date;
}

function toIsoIfValid(date: Date): string | undefined {
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function computeNextRun(schedule: ScheduleKind, enabled: boolean, lastTriggeredAt?: string): string | undefined {
  if (!enabled) return undefined;

  const now = new Date();
  switch (schedule.type) {
    case "once":
      return lastTriggeredAt ? undefined : toIsoIfValid(new Date(schedule.at));
    case "daily": {
      const next = dateAtTime(now, schedule.time);
      if (!next) return undefined;
      if (next <= now) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }
    case "weekly": {
      for (let offset = 0; offset <= 7; offset += 1) {
        const candidate = dateAtTime(now, schedule.time);
        if (!candidate) return undefined;
        candidate.setDate(candidate.getDate() + offset);
        if (schedule.days.includes(isoWeekday(candidate)) && candidate > now) {
          return candidate.toISOString();
        }
      }
      return undefined;
    }
    case "interval": {
      const next = dateAtTime(now, schedule.start);
      if (!next || schedule.minutes <= 0) return undefined;
      while (next <= now) next.setMinutes(next.getMinutes() + schedule.minutes);
      return next.toISOString();
    }
    case "cron":
      return undefined;
  }
}

function createSchedule(args: CommandArgs): ScheduledTask {
  const input = requireObject<CreateScheduleInput>("create_schedule", args, "input");
  const createdAt = new Date().toISOString();
  const task: ScheduledTask = {
    id: newId().slice(0, 8),
    ...input,
    createdAt,
    nextRunAt: computeNextRun(input.schedule, input.enabled),
  };

  saveSchedules([...loadSchedules(), task]);
  return task;
}

function updateSchedule(args: CommandArgs): ScheduledTask {
  const input = requireObject<UpdateScheduleInput>("update_schedule", args, "input");
  const schedules = loadSchedules();
  const idx = schedules.findIndex((schedule) => schedule.id === input.id);
  if (idx === -1) throw commandError("update_schedule", `schedule not found: ${input.id}`);

  const task: ScheduledTask = {
    ...schedules[idx],
    ...input,
    nextRunAt: computeNextRun(input.schedule, input.enabled, schedules[idx].lastTriggeredAt),
  };
  schedules[idx] = task;
  saveSchedules(schedules);
  return task;
}

function deleteSchedule(args: CommandArgs): boolean {
  const id = requireString("delete_schedule", args, "id");
  const schedules = loadSchedules();
  const next = schedules.filter((schedule) => schedule.id !== id);
  saveSchedules(next);
  return next.length < schedules.length;
}

function toggleScheduleEnabled(args: CommandArgs): ScheduledTask | null {
  const id = requireString("toggle_schedule_enabled", args, "id");
  const enabled = args?.enabled;
  if (typeof enabled !== "boolean") {
    throw commandError("toggle_schedule_enabled", 'missing boolean argument "enabled"');
  }

  const schedules = loadSchedules();
  const idx = schedules.findIndex((schedule) => schedule.id === id);
  if (idx === -1) return null;

  const task: ScheduledTask = {
    ...schedules[idx],
    enabled,
    nextRunAt: computeNextRun(schedules[idx].schedule, enabled, schedules[idx].lastTriggeredAt),
  };
  schedules[idx] = task;
  saveSchedules(schedules);
  return task;
}

function purgeScheduleHistory(args: CommandArgs): number {
  const id = requireString("purge_schedule_history", args, "id");
  const cards = loadCards();
  const next = cards.filter(
    (card) =>
      card.linkedTaskId !== id ||
      card.status === "in_progress" ||
      card.status === "waiting_feedback" ||
      card.status === "awaiting_review",
  );
  saveCards(next);
  return cards.length - next.length;
}

export async function browserInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const value = (() => {
    switch (cmd) {
      case "get_cards":
        return loadCards();
      case "add_card":
        return addCard(args);
      case "update_card":
        return updateCard(args);
      case "move_card":
        return moveCard(args);
      case "reorder_card":
        return reorderCard(args);
      case "delete_card":
        return deleteCard(args);
      case "trash_card":
        return trashCard(args);
      case "restore_card":
        return restoreCard(args);
      case "add_revision_note":
        return addRevisionNote(args);
      case "answer_feedback":
        return answerFeedback(args);
      case "import_cards": {
        const cards = args?.cards;
        if (!Array.isArray(cards)) throw commandError("import_cards", 'missing array argument "cards"');
        saveCards(cards as KanbanCard[]);
        return true;
      }
      case "get_settings":
        return getSettings();
      case "save_settings":
        return saveSettings(args);
      case "list_schedules":
        return loadSchedules();
      case "create_schedule":
        return createSchedule(args);
      case "update_schedule":
        return updateSchedule(args);
      case "delete_schedule":
        return deleteSchedule(args);
      case "toggle_schedule_enabled":
        return toggleScheduleEnabled(args);
      case "purge_schedule_history":
        return purgeScheduleHistory(args);
      case "clear_logs":
        return true;
      default:
        throw commandError(cmd, "this command requires the Tauri desktop backend");
    }
  })();

  return value as T;
}

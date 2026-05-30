import {
  type AppSettings,
  addCard,
  addRevisionNote,
  answerFeedback,
  type CreateCardInput,
  type CreateScheduleInput,
  createSchedule,
  DEFAULT_SETTINGS,
  deleteCard,
  deleteSchedule,
  getCards,
  getSettings,
  importCards,
  type KanbanCard,
  type KanbanStatus,
  listSchedules,
  moveCard,
  purgeScheduleHistory,
  reorderCard,
  restoreCard,
  type ScheduledTask,
  type Store,
  saveSettings,
  toggleScheduleEnabled,
  trashCard,
  type UpdateCardInput,
  type UpdateScheduleInput,
  updateCard,
  updateSchedule,
} from "@myra/shared";

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
  if (storage) storage.setItem(key, raw);
  else memoryStore.set(key, raw);
}

/**
 * localStorage-backed Store. Migrates legacy cards missing a `position` on
 * read (matching the original browser backend + the Rust loader).
 */
const localStorageStore: Store = {
  async getCards() {
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
    if (changed) writeJson(CARDS_KEY, cards);
    return cards;
  },
  async saveCards(cards) {
    writeJson(CARDS_KEY, cards);
  },
  async getSettings() {
    return readJson<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  },
  async saveSettings(settings) {
    writeJson(SETTINGS_KEY, settings);
  },
  async getSchedules() {
    return readJson<ScheduledTask[]>(SCHEDULES_KEY, []);
  },
  async saveSchedules(schedules) {
    writeJson(SCHEDULES_KEY, schedules);
  },
};

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

/**
 * Browser-only stand-in for the desktop backend. Dispatches data commands to
 * the shared domain logic over a localStorage Store; agent/process commands
 * throw the `[Dev Mode]` sentinel so callers ignore them in the browser.
 */
export async function browserInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const store = localStorageStore;

  const result: unknown = await (async () => {
    switch (cmd) {
      case "get_cards":
        return getCards(store);
      case "add_card":
        return addCard(store, requireObject<CreateCardInput>("add_card", args, "input"));
      case "update_card":
        return updateCard(store, requireObject<UpdateCardInput>("update_card", args, "input"));
      case "move_card":
        return moveCard(
          store,
          requireString("move_card", args, "id"),
          requireString("move_card", args, "status") as KanbanStatus,
        );
      case "reorder_card": {
        const newPosition = args?.newPosition;
        if (typeof newPosition !== "number") {
          throw commandError("reorder_card", 'missing number argument "newPosition"');
        }
        return reorderCard(
          store,
          requireString("reorder_card", args, "id"),
          newPosition,
          optionalString(args, "status") as KanbanStatus | undefined,
        );
      }
      case "delete_card":
        return deleteCard(store, requireString("delete_card", args, "id"));
      case "trash_card":
        return trashCard(store, requireString("trash_card", args, "id"));
      case "restore_card":
        return restoreCard(
          store,
          requireString("restore_card", args, "id"),
          optionalString(args, "status") as KanbanStatus | undefined,
        );
      case "add_revision_note": {
        const input = requireObject<RevisionInput>("add_revision_note", args, "input");
        return addRevisionNote(store, input.id, input.note);
      }
      case "answer_feedback": {
        const input = requireObject<FeedbackInput>("answer_feedback", args, "input");
        return answerFeedback(store, input.id, input.answer);
      }
      case "import_cards": {
        const cards = args?.cards;
        if (!Array.isArray(cards)) throw commandError("import_cards", 'missing array argument "cards"');
        return importCards(store, cards as KanbanCard[]);
      }
      case "get_settings":
        return getSettings(store);
      case "save_settings":
        return saveSettings(store, requireObject<AppSettings>("save_settings", args, "settings"));
      case "list_schedules":
        return listSchedules(store);
      case "create_schedule":
        return createSchedule(store, requireObject<CreateScheduleInput>("create_schedule", args, "input"));
      case "update_schedule":
        return updateSchedule(store, requireObject<UpdateScheduleInput>("update_schedule", args, "input"));
      case "delete_schedule":
        return deleteSchedule(store, requireString("delete_schedule", args, "id"));
      case "toggle_schedule_enabled": {
        const enabled = args?.enabled;
        if (typeof enabled !== "boolean") {
          throw commandError("toggle_schedule_enabled", 'missing boolean argument "enabled"');
        }
        return toggleScheduleEnabled(store, requireString("toggle_schedule_enabled", args, "id"), enabled);
      }
      case "purge_schedule_history":
        return purgeScheduleHistory(store, requireString("purge_schedule_history", args, "id"));
      case "clear_logs":
        return true;
      default:
        throw new Error(`[Dev Mode] Tauri backend not available — "${cmd}" skipped`);
    }
  })();

  return result as T;
}

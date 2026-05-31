import {
  type AppSettings,
  DEFAULT_SETTINGS,
  dispatchData,
  type KanbanCard,
  type KanbanStatus,
  type ScheduledTask,
  type Store,
  UnknownCommandError,
} from "@myra/shared";

const CARDS_KEY = "myra-agents.dev.cards";
const SETTINGS_KEY = "myra-agents.dev.settings";
const SCHEDULES_KEY = "myra-agents.dev.schedules";

const memoryStore = new Map<string, string>();
let warnedMemoryStore = false;

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

/**
 * Browser-only stand-in for the desktop backend. Dispatches data commands to
 * the shared domain logic over a localStorage Store; agent/process commands
 * (not data commands) surface as the `[Dev Mode]` sentinel so callers ignore
 * them in the browser.
 */
export async function browserInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Control commands are no-ops offline (no live log stream to throttle).
  if (cmd === "set_log_watch") return { ok: true } as T;
  try {
    return await dispatchData<T>(localStorageStore, cmd, args);
  } catch (error) {
    if (error instanceof UnknownCommandError) {
      throw new Error(`[Dev Mode] Tauri backend not available — "${cmd}" skipped`);
    }
    throw error;
  }
}

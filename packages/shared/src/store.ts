import type { KanbanCard } from "./types/kanban";
import type { ScheduledTask } from "./types/schedule";
import type { AppSettings } from "./types/settings";

/**
 * Persistence boundary for the domain logic. The same domain functions run
 * against any implementation: localStorage in the browser (offline dev), JSON
 * files in the Node sidecar/self-host server, or SQLite in the cloud.
 *
 * All methods are async so one domain code path serves both the synchronous
 * localStorage backend and the asynchronous fs/sqlite backends.
 */
export interface Store {
  getCards(): Promise<KanbanCard[]>;
  saveCards(cards: KanbanCard[]): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  getSchedules(): Promise<ScheduledTask[]>;
  saveSchedules(schedules: ScheduledTask[]): Promise<void>;
}

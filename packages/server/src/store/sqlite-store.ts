import { type AppSettings, DEFAULT_SETTINGS, type KanbanCard, type ScheduledTask, type Store } from "@myra/shared";

import { resolveDataDir } from "./file-store";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * SQLite-backed {@link Store} (`MYRA_STORE=sqlite`), aimed at the managed-cloud
 * deployment where a single `board.json` won't survive concurrent writers. Each
 * logical collection (cards / schedules / settings) is one JSON document row in
 * a `documents` table — the {@link Store} contract is coarse-grained
 * (whole-collection get/save), so this keeps a single code path while moving
 * persistence off the filesystem. Per-row card/schedule tables + a tenant
 * boundary are the next step once auth lands (see the cloud risks in
 * `docs/multi-server-backend-plan.md`).
 */
export class SqliteStore implements Store {
  private readonly db: Database;

  constructor(dir = resolveDataDir()) {
    mkdirSync(dir, { recursive: true });
    this.db = new Database(join(dir, "myra.db"));
    this.db.run("CREATE TABLE IF NOT EXISTS documents (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }

  private read<T>(key: string, fallback: T): T {
    const row = this.db.query("SELECT value FROM documents WHERE key = ?").get(key) as { value: string } | null;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  private store(key: string, value: unknown): void {
    this.db
      .query("INSERT INTO documents (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
  }

  async getCards(): Promise<KanbanCard[]> {
    return this.read<KanbanCard[]>("cards", []);
  }

  async saveCards(cards: KanbanCard[]): Promise<void> {
    this.store("cards", cards);
  }

  async getSettings(): Promise<AppSettings> {
    return this.read<AppSettings>("settings", DEFAULT_SETTINGS);
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.store("settings", settings);
  }

  async getSchedules(): Promise<ScheduledTask[]> {
    return this.read<ScheduledTask[]>("schedules", []);
  }

  async saveSchedules(schedules: ScheduledTask[]): Promise<void> {
    this.store("schedules", schedules);
  }
}

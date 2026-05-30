import { type AppSettings, DEFAULT_SETTINGS, type KanbanCard, type ScheduledTask, type Store } from "@myra/shared";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** True when running in demo mode (`DEMO=1|true`) — isolates data + seeds. */
export function isDemoMode(): boolean {
  const v = process.env.DEMO?.toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Resolve the data directory. `MYRA_DIR` overrides; otherwise
 * `~/.myra-agents` (or `~/.myra-agents-demo` in demo mode) — the same layout
 * the Rust backend uses, so files stay interchangeable.
 */
export function resolveDataDir(): string {
  if (process.env.MYRA_DIR) return process.env.MYRA_DIR;
  return join(homedir(), isDemoMode() ? ".myra-agents-demo" : ".myra-agents");
}

const PRETTY = 2;

/** Serialize per-key writes so concurrent RPCs can't interleave a file. */
class FileLock {
  private chains = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);
    this.chains.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }
}

/**
 * The Rust settings.json carries only `defaultAgent` + `agents` +
 * `maxConcurrentAgents`. The TS `AppSettings` adds `defaultAgentId` (renamed)
 * plus `theme`/`locale`/`defaultHomePage`. Adapt on read so the client always
 * gets a complete `AppSettings`.
 */
function adaptSettings(raw: Record<string, unknown>): AppSettings {
  const defaultAgentId =
    (raw.defaultAgentId as string | undefined) ??
    (raw.defaultAgent as string | undefined) ??
    DEFAULT_SETTINGS.defaultAgentId;
  return {
    defaultAgentId,
    agents: (raw.agents as AppSettings["agents"] | undefined) ?? DEFAULT_SETTINGS.agents,
    maxConcurrentAgents: (raw.maxConcurrentAgents as number | undefined) ?? DEFAULT_SETTINGS.maxConcurrentAgents,
    defaultHomePage:
      (raw.defaultHomePage as AppSettings["defaultHomePage"] | undefined) ?? DEFAULT_SETTINGS.defaultHomePage,
    locale: (raw.locale as AppSettings["locale"] | undefined) ?? DEFAULT_SETTINGS.locale,
    theme: (raw.theme as AppSettings["theme"] | undefined) ?? DEFAULT_SETTINGS.theme,
  };
}

/**
 * Write a settings superset: the full `AppSettings` plus a `defaultAgent`
 * mirror so a Rust reader still resolves its preset. Unknown fields are
 * ignored by serde, so this stays compatible both directions.
 */
function serializeSettings(s: AppSettings): string {
  return JSON.stringify({ ...s, defaultAgent: s.defaultAgentId }, null, PRETTY);
}

/**
 * JSON-file Store under the data dir, mirroring the Rust on-disk format
 * (camelCase, 2-space pretty). The server is the sole writer, so a per-file
 * lock is enough — no cross-process file-watch race.
 */
export class FileStore implements Store {
  private readonly dir: string;
  private readonly lock = new FileLock();

  constructor(dir = resolveDataDir()) {
    this.dir = dir;
  }

  private path(file: string): string {
    return join(this.dir, file);
  }

  private async readArray<T>(file: string): Promise<T[]> {
    try {
      const raw = await readFile(this.path(file), "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  private async write(file: string, body: string): Promise<void> {
    await this.lock.run(file, async () => {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.path(file), body, "utf8");
    });
  }

  async getCards(): Promise<KanbanCard[]> {
    return this.readArray<KanbanCard>("board.json");
  }

  async saveCards(cards: KanbanCard[]): Promise<void> {
    await this.write("board.json", JSON.stringify(cards, null, PRETTY));
  }

  async getSettings(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.path("settings.json"), "utf8");
      return adaptSettings(JSON.parse(raw) as Record<string, unknown>);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_SETTINGS;
      throw err;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.write("settings.json", serializeSettings(settings));
  }

  async getSchedules(): Promise<ScheduledTask[]> {
    return this.readArray<ScheduledTask>("schedules.json");
  }

  async saveSchedules(schedules: ScheduledTask[]): Promise<void> {
    await this.write("schedules.json", JSON.stringify(schedules, null, PRETTY));
  }
}

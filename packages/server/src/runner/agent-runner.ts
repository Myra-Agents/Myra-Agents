import {
  type AgentPreset,
  type AgentResultFile,
  type AgentRun,
  type AppSettings,
  applyResult,
  buildAgentCommand,
  buildPrompt,
  EVENTS,
  type KanbanCard,
  materializeCardForSchedule,
  newId,
  nextPositionFor,
  type Store,
} from "@myra/shared";

import type { EventBus } from "../realtime/bus";
import { resolveDataDir } from "../store/file-store";
import type { AgentExecutor, RunHandle } from "./executor";
import { selectExecutor } from "./select-executor";
import { existsSync, statSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

/** Result of a launch request — mirrors the Rust `LaunchResult`. */
export interface LaunchResult {
  runId?: string;
  queued: boolean;
}

/** One artifact (log or archived result file) for a card's runs. */
export interface RunArtifact {
  name: string;
  path: string;
  size: number;
  modified?: string;
}

function resolvePreset(settings: AppSettings, presetId?: string): AgentPreset {
  const id = presetId?.trim() || settings.defaultAgentId;
  const preset = settings.agents.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown agent preset: ${id}`);
  return preset;
}

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? homedir() ?? ".";
}

/** Compact UTC stamp `YYYYMMDDTHHMMSS` from an ISO timestamp. */
function stampFrom(iso: string): string {
  return iso.slice(0, 19).replace(/[-:]/g, "");
}

/**
 * Owns the agent run lifecycle for one server: spawning, log streaming, the
 * concurrency queue, cancellation, result-file ingestion, and artifact reads.
 * A port of `agent.rs` (`AgentProcesses` + spawn/queue/cancel) and the
 * transition half of `watcher.rs`, over the shared `Store` and `EventBus`.
 */
export class AgentRunner {
  private readonly store: Store;
  private readonly bus: EventBus;
  private readonly executor: AgentExecutor;
  private readonly dataDir: string;

  private readonly running = new Map<string, RunHandle>();
  private readonly queue: string[] = [];
  /** Guards against onExit + watcher double-processing the same result file. */
  private readonly handling = new Set<string>();
  /**
   * Adaptive log cadence: which cards have a live viewer (an open card modal on
   * some dashboard). `null` = no client has opted in → stream every line
   * (back-compat). A set = stream only those cards' lines live; everything else
   * is still written to the run log and fetched on demand via `get_run_log`.
   * This is what lets a scheduled/headless run produce no live frames — keeping
   * an idle Cloudflare DO hibernating. See `docs/centralized-hub-plan.md` §P6.
   */
  private logWatch: Set<string> | null = null;

  constructor(store: Store, bus: EventBus, opts: { dataDir?: string; executor?: AgentExecutor } = {}) {
    this.store = store;
    this.bus = bus;
    this.executor = opts.executor ?? selectExecutor();
    this.dataDir = opts.dataDir ?? resolveDataDir();
  }

  private runsDir(): string {
    return join(this.dataDir, "agent-runs");
  }

  private resultsDir(): string {
    return join(this.dataDir, "agent-results");
  }

  /** Number of agents currently running. */
  runningCount(): number {
    return this.running.size;
  }

  /**
   * Set the live-log viewer set (the `set_log_watch` command). `null` restores
   * stream-everything; an array (possibly empty) restricts live frames to those
   * card ids. Result frames (`agent-result-changed`) are never gated.
   */
  setLogWatch(cardIds: string[] | null): void {
    this.logWatch = cardIds === null ? null : new Set(cardIds);
  }

  /** Emit a log line only if a viewer is watching this card (or no gate is set). */
  private emitLog(cardId: string, runId: string, line: string): void {
    if (this.logWatch !== null && !this.logWatch.has(cardId)) return;
    this.bus.emit(EVENTS.agentLogAppended, { cardId, runId, line });
  }

  /**
   * Concurrency-aware launch. Spawns immediately when a slot is free, else
   * enqueues the card and marks it `agentQueued`. `maxConcurrentAgents === 0`
   * means unlimited. Mirrors `agent.rs::request_launch`.
   */
  async launch(cardId: string, workingDir?: string): Promise<LaunchResult> {
    const settings = await this.store.getSettings();
    const max = settings.maxConcurrentAgents ?? 0;
    const atLimit = max !== 0 && this.runningCount() >= max;

    if (atLimit) {
      if (!this.queue.includes(cardId)) this.queue.push(cardId);
      await this.markQueued(cardId);
      return { queued: true };
    }

    const runId = await this.spawnForCard(cardId, workingDir);
    return { runId, queued: false };
  }

  private async markQueued(cardId: string): Promise<void> {
    const cards = await this.store.getCards();
    const idx = cards.findIndex((c) => c.id === cardId);
    if (idx === -1) return;
    const updated: KanbanCard = { ...cards[idx], agentQueued: true, updatedAt: new Date().toISOString() };
    cards[idx] = updated;
    await this.store.saveCards(cards);
    this.bus.emit(EVENTS.agentResultChanged, { card: updated });
  }

  /** Pull and spawn the next queued card when a slot frees up. */
  private async dequeueAndSpawn(): Promise<void> {
    const settings = await this.store.getSettings();
    const max = settings.maxConcurrentAgents ?? 0;
    if (max !== 0 && this.runningCount() >= max) return;

    const cardId = this.queue.shift();
    if (!cardId) return;

    // Skip cards that vanished or are no longer queued (e.g. trashed).
    const cards = await this.store.getCards();
    const stillQueued = cards.some((c) => c.id === cardId && c.agentQueued);
    if (!stillQueued) {
      await this.dequeueAndSpawn();
      return;
    }

    try {
      await this.spawnForCard(cardId);
    } catch (err) {
      console.error(`[runner] failed to spawn queued card ${cardId}:`, err);
      await this.dequeueAndSpawn();
    }
  }

  /**
   * Spawn the configured agent for a card. Builds the prompt + result
   * protocol, resolves the preset + working directory, streams stdout/stderr
   * to `agent-runs/{runId}.log` (emitting `agent-log-appended`), and flips the
   * card to `in_progress`. Returns the new run id. Port of
   * `agent.rs::spawn_agent_for_card`.
   */
  async spawnForCard(cardId: string, workingDir?: string): Promise<string> {
    const cards = await this.store.getCards();
    const idx = cards.findIndex((c) => c.id === cardId);
    if (idx === -1) throw new Error(`Card not found: ${cardId}`);
    const card = cards[idx];

    const basePrompt = card.agentPrompt ?? (card.description ? `${card.title}\n\n${card.description}` : card.title);

    await mkdir(this.resultsDir(), { recursive: true });
    await mkdir(this.runsDir(), { recursive: true });

    const resultFile = join(this.resultsDir(), `${card.id}.json`);
    await rm(resultFile, { force: true });
    const resultPathStr = resultFile.replaceAll("\\", "/");

    const fullPrompt = buildPrompt(basePrompt, card.revisionNotes ?? [], card.id, resultPathStr);

    const settings = await this.store.getSettings();
    const preset = resolvePreset(settings, card.agentPresetId);

    const resolvedDir = workingDir?.trim() || card.workingDir?.trim() || preset.workingDir?.trim() || homeDir();
    if (!existsSync(resolvedDir) || !statSync(resolvedDir).isDirectory()) {
      throw new Error(`Working directory does not exist: ${resolvedDir}`);
    }

    const runId = newId();
    const logPath = join(this.runsDir(), `${runId}.log`);
    await writeFile(logPath, "");

    const label = `${preset.name} (${preset.binary})`;
    const { binary, args } = buildAgentCommand(preset.binary, preset.argsTemplate, fullPrompt);

    // Serialize log appends so concurrent stdout/stderr lines never interleave
    // a partial write.
    let logChain: Promise<unknown> = Promise.resolve();
    const append = (text: string) => {
      logChain = logChain.then(() => appendFile(logPath, text).catch(() => undefined));
    };

    const handle = this.executor.run(
      { binary, args, cwd: resolvedDir },
      {
        onLine: (stream, line) => {
          const prefixed = stream === "err" ? `[err] ${line}\n` : `${line}\n`;
          append(prefixed);
          this.emitLog(card.id, runId, prefixed.trimEnd());
        },
        onExit: (code) => {
          void this.onExit(card.id, runId, label, code, logPath);
        },
      },
    );

    this.running.set(card.id, handle);

    const now = new Date().toISOString();
    const run: AgentRun = { id: runId, startedAt: now, prompt: fullPrompt, status: "running" };
    const updated: KanbanCard = {
      ...card,
      status: "in_progress",
      agentQueued: false,
      agentPresetId: preset.id,
      agentRunId: runId,
      agentRunStartedAt: now,
      agentRunEndedAt: undefined,
      agentResult: undefined,
      agentQuestion: undefined,
      updatedAt: now,
      runHistory: [...(card.runHistory ?? []), run],
    };
    const fresh = await this.store.getCards();
    const freshIdx = fresh.findIndex((c) => c.id === card.id);
    if (freshIdx !== -1) {
      fresh[freshIdx] = updated;
      await this.store.saveCards(fresh);
    }
    this.bus.emit(EVENTS.agentResultChanged, { card: updated });

    return runId;
  }

  private async onExit(
    cardId: string,
    runId: string,
    label: string,
    code: number | null,
    logPath: string,
  ): Promise<void> {
    const footer = `\n[myra-agents] ${label} exited with code ${code ?? "?"}\n`;
    await appendFile(logPath, footer).catch(() => undefined);
    this.emitLog(cardId, runId, footer.trimEnd());

    this.running.delete(cardId);

    // The agent signals completion by writing the result file; read it here as
    // the canonical path (the FS watcher is only a backstop).
    await this.handleResultFile(join(this.resultsDir(), `${cardId}.json`));

    await this.dequeueAndSpawn();
  }

  /**
   * Ingest an `agent-results/{cardId}.json` file: apply the transition to the
   * card, archive the file, and emit `agent-result-changed`. Tolerant of a
   * missing/already-archived file so onExit and the watcher can both call it.
   * Port of `watcher.rs::handle_result_file`.
   */
  async handleResultFile(path: string): Promise<void> {
    if (this.handling.has(path)) return;
    this.handling.add(path);
    try {
      let content: string;
      try {
        content = await readFile(path, "utf8");
      } catch {
        return; // missing / already archived
      }

      let parsed: AgentResultFile;
      try {
        parsed = JSON.parse(content) as AgentResultFile;
      } catch (err) {
        console.error(`[runner] failed to parse ${path}:`, err);
        return;
      }

      const cards = await this.store.getCards();
      const idx = cards.findIndex((c) => c.id === parsed.cardId);
      if (idx === -1) {
        console.error(`[runner] unknown cardId in result file: ${parsed.cardId}`);
        return;
      }

      const now = new Date().toISOString();
      const updated = applyResult(cards[idx], parsed, now);
      cards[idx] = updated;
      await this.store.saveCards(cards);

      // Archive so the next run starts fresh.
      try {
        await rename(path, join(this.runsDir(), `${stampFrom(now)}-${basename(path)}`));
      } catch {
        // Non-fatal: leave the file if the archive move fails.
      }

      this.bus.emit(EVENTS.agentResultChanged, { card: updated });
    } finally {
      this.handling.delete(path);
    }
  }

  /** Cancel a running (or queued) agent for a card. Mirrors `agent.rs::cancel_agent`. */
  async cancel(cardId: string): Promise<boolean> {
    const handle = this.running.get(cardId);
    this.running.delete(cardId);

    const qIdx = this.queue.indexOf(cardId);
    if (qIdx !== -1) this.queue.splice(qIdx, 1);

    if (handle) await handle.cancel();

    const cards = await this.store.getCards();
    const idx = cards.findIndex((c) => c.id === cardId);
    if (idx !== -1) {
      const card = cards[idx];
      const now = new Date().toISOString();
      const runHistory = (card.runHistory ?? []).map((r) =>
        r.id === card.agentRunId && r.status === "running" ? { ...r, status: "failed" as const, endedAt: now } : r,
      );
      cards[idx] = {
        ...card,
        agentQueued: false,
        agentRunId: undefined,
        agentRunEndedAt: now,
        updatedAt: now,
        runHistory,
      };
      await this.store.saveCards(cards);
      this.bus.emit(EVENTS.agentResultChanged, { card: cards[idx] });
    }

    // Cancelling freed a slot.
    await this.dequeueAndSpawn();
    return handle !== undefined;
  }

  /** Read a run's full log, or "" if absent. */
  async getRunLog(runId: string): Promise<string> {
    try {
      return await readFile(join(this.runsDir(), `${runId}.log`), "utf8");
    } catch {
      return "";
    }
  }

  /** List a card's run logs + archived result files, newest first. */
  async listRunArtifacts(cardId: string): Promise<RunArtifact[]> {
    const cards = await this.store.getCards();
    const card = cards.find((c) => c.id === cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);

    const runIds = (card.runHistory ?? []).map((r) => r.id);
    let names: string[];
    try {
      names = await readdir(this.runsDir());
    } catch {
      return [];
    }

    const artifacts: RunArtifact[] = [];
    for (const name of names) {
      const matches = runIds.some((rid) => name.includes(rid)) || name.endsWith(`${cardId}.json`);
      if (!matches) continue;
      const full = join(this.runsDir(), name);
      let info: Awaited<ReturnType<typeof stat>>;
      try {
        info = await stat(full);
      } catch {
        continue;
      }
      artifacts.push({ name, path: full, size: info.size, modified: info.mtime.toISOString() });
    }

    artifacts.sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? ""));
    return artifacts;
  }

  /**
   * Force a schedule to fire now: materialize a card, persist it, and spawn the
   * agent immediately (bypassing the queue, like `schedule.rs::trigger_schedule_now`).
   */
  async triggerScheduleNow(id: string): Promise<string> {
    const schedules = await this.store.getSchedules();
    const task = schedules.find((s) => s.id === id);
    if (!task) throw new Error(`Schedule not found: ${id}`);

    const cards = await this.store.getCards();
    const now = new Date().toISOString();
    const card = materializeCardForSchedule(task, now, nextPositionFor(cards, "todo"));
    await this.store.saveCards([...cards, card]);

    const runId = await this.spawnForCard(card.id);
    const after = await this.store.getCards();
    const updated = after.find((c) => c.id === card.id) ?? card;
    this.bus.emit(EVENTS.agentResultChanged, { card: updated });
    return runId;
  }
}

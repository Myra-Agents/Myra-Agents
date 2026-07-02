import { create } from "zustand";

import { parseGlobalId, toGlobalId } from "@/lib/aggregate/global-id";
import { connectionManager } from "@/lib/connections/manager";
import { agentProps } from "@/lib/posthog/agent-props";
import { captureError, track } from "@/lib/posthog/events";
import { isDevModeError } from "@/lib/tauri";
import type { CreateCardInput, KanbanCard, KanbanStatus, LaunchResult, UpdateCardInput } from "@/types/kanban";
import type { AgentPreset } from "@/types/settings";

/**
 * Global board store — the single source of truth for the aggregated Kanban
 * board, shared by every screen. Replaces the old per-component `useKanban`
 * local state so a change on one page (or a backend push event) is reflected
 * everywhere at once, with no polling.
 *
 * It self-initializes on first use ({@link ensureBoardLive}) and wires the
 * push-based live updates once for the whole app: `get_cards` per connection,
 * `agent-result-changed` (run finished / needs feedback → upsert the card) and
 * `agent-log-appended` (stream the run log line-by-line into {@link logs}).
 * Re-subscribes whenever the set of connections changes.
 */

/** Rewrite a server-local card's id into a GlobalId tagged by its connection. */
function globalize(card: KanbanCard, connId: string): KanbanCard {
  return { ...card, id: toGlobalId(connId, card.id) };
}

/** Cap the live log buffer per card so a long-running agent can't grow it
 * unbounded; the authoritative full log is re-fetched via `get_run_log`. */
const MAX_LINES_PER_CARD = 500;

interface AgentResultEvent {
  card: KanbanCard;
}
interface AgentLogEvent {
  cardId: string;
  runId: string;
  line: string;
}

interface BoardState {
  cards: KanbanCard[];
  loading: boolean;
  error: string | null;
  /** Cards whose Stop was clicked but whose backend lifecycle event hasn't
   * landed yet — drives an instant "Stopping…" state; pruned once a card leaves
   * the running/queued state. */
  cancellingIds: Set<string>;
  /** Live run log tail per card GlobalId, fed by `agent-log-appended`. */
  logs: Map<string, string[]>;
  /** Latest agent presets (for analytics props); kept fresh by the hook. */
  presets: AgentPreset[];
  /** Live subscriptions started once. */
  live: boolean;

  setPresets: (presets: AgentPreset[]) => void;
  loadCards: () => Promise<void>;
  upsertCard: (card: KanbanCard) => void;
  appendLog: (globalId: string, line: string) => void;

  addCard: (input: CreateCardInput, targetConnId?: string) => Promise<KanbanCard>;
  updateCard: (input: UpdateCardInput) => Promise<KanbanCard | null>;
  moveCard: (id: string, status: KanbanStatus) => Promise<KanbanCard | null>;
  reorderCard: (id: string, newPosition: number, status?: KanbanStatus) => Promise<KanbanCard | null>;
  deleteCard: (id: string) => Promise<boolean>;
  trashCard: (id: string) => Promise<KanbanCard | null>;
  restoreCard: (id: string, status?: KanbanStatus) => Promise<KanbanCard | null>;
  addRevisionNote: (id: string, note: string) => Promise<KanbanCard | null>;
  answerFeedback: (id: string, answer: string) => Promise<KanbanCard | null>;
  launchAgent: (cardId: string, workingDir?: string) => Promise<LaunchResult>;
  cancelAgent: (cardId: string) => Promise<boolean>;
}

/** Reconcile optimistic "cancelling" flags against the truth in `cards`: once a
 * card is no longer running/queued the stop has landed, so drop its flag. */
function reconcileCancelling(cancelling: Set<string>, cards: KanbanCard[]): Set<string> {
  if (cancelling.size === 0) return cancelling;
  let changed = false;
  const next = new Set(cancelling);
  for (const id of cancelling) {
    const card = cards.find((c) => c.id === id);
    if (!card || (card.status !== "in_progress" && !card.agentQueued)) {
      next.delete(id);
      changed = true;
    }
  }
  return changed ? next : cancelling;
}

/** Apply a cards update and re-reconcile the cancelling set in one shot. */
function commitCards(set: (partial: Partial<BoardState>) => void, get: () => BoardState, cards: KanbanCard[]) {
  set({ cards, cancellingIds: reconcileCancelling(get().cancellingIds, cards) });
}

export const useBoardStore = create<BoardState>((set, get) => ({
  cards: [],
  loading: true,
  error: null,
  cancellingIds: new Set(),
  logs: new Map(),
  presets: [],
  live: false,

  setPresets: (presets) => set({ presets }),

  loadCards: async () => {
    try {
      const results = await connectionManager.invokeAll<KanbanCard[]>("get_cards");
      const merged: KanbanCard[] = [];
      let realError: string | null = null;
      let anySuccess = false;
      for (const r of results) {
        if (r.data) {
          anySuccess = true;
          for (const card of r.data) merged.push(globalize(card, r.connId));
        } else if (r.error && !isDevModeError(r.error)) {
          realError = String(r.error);
        }
      }
      commitCards(set, get, merged);
      // Only surface an error when every connection failed — partial failure is
      // a first-class state (the survivors' cards still render).
      set({ error: anySuccess ? null : realError });
    } catch (e) {
      if (!isDevModeError(e)) {
        console.error("Failed to load cards:", e);
        captureError(e, { where: "boardStore.loadCards" });
        set({ error: String(e) });
      }
    } finally {
      set({ loading: false });
    }
  },

  upsertCard: (card) => {
    const prev = get().cards;
    const idx = prev.findIndex((c) => c.id === card.id);
    let incoming = card;
    if (idx !== -1) {
      const existing = prev[idx];
      // Ignore stale / out-of-order pushes. The server's trigger-now path emits a
      // trailing PRE-spawn snapshot (still Todo, not queued, older `updatedAt`)
      // AFTER the spawn already pushed the in-progress card — applying it reverts
      // a just-launched run to idle, so "Stop all" never appears. `updatedAt`
      // only moves forward (ms precision), so a strictly-older push is stale: drop
      // it wholesale, not just its runHistory.
      if (existing.updatedAt && incoming.updatedAt && incoming.updatedAt < existing.updatedAt) return;
      // Belt-and-braces: never let a card with fewer runs clobber a richer history.
      if ((incoming.runHistory?.length ?? 0) < (existing.runHistory?.length ?? 0)) {
        incoming = { ...incoming, runHistory: existing.runHistory };
      }
    }
    const next = idx === -1 ? [...prev, incoming] : prev.map((c) => (c.id === incoming.id ? incoming : c));
    commitCards(set, get, next);
  },

  appendLog: (globalId, line) => {
    const prev = get().logs;
    const next = new Map(prev);
    const existing = next.get(globalId) ?? [];
    const updated = [...existing, line];
    if (updated.length > MAX_LINES_PER_CARD) updated.splice(0, updated.length - MAX_LINES_PER_CARD);
    next.set(globalId, updated);
    set({ logs: next });
  },

  addCard: async (input, targetConnId) => {
    const connId = targetConnId ?? connectionManager.primaryId();
    const card = globalize(await connectionManager.invokeOne<KanbanCard>(connId, "add_card", { input }), connId);
    commitCards(set, get, [...get().cards, card]);
    track("card_created", {
      card_id: card.id,
      agent_preset_id: input.agentPresetId,
      has_prompt: !!input.agentPrompt,
      tags_count: input.tags?.length ?? 0,
      use_worktree: input.useWorktree ?? false,
      ...agentProps(input, get().presets),
    });
    return card;
  },

  updateCard: async (input) => {
    const { connId, entityId } = parseGlobalId(input.id);
    const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "update_card", {
      input: { ...input, id: entityId },
    });
    if (card) get().upsertCard(globalize(card, connId));
    return card;
  },

  moveCard: async (id, status) => {
    const { connId, entityId } = parseGlobalId(id);
    commitCards(
      set,
      get,
      get().cards.map((c) => (c.id === id ? { ...c, status } : c)),
    );
    try {
      const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "move_card", { id: entityId, status });
      if (card) get().upsertCard(globalize(card, connId));
      track("card_moved", { card_id: id, to_status: status });
      return card;
    } catch (e) {
      await get().loadCards();
      throw e;
    }
  },

  reorderCard: async (id, newPosition, status) => {
    const { connId, entityId } = parseGlobalId(id);
    commitCards(
      set,
      get,
      get().cards.map((c) => (c.id === id ? { ...c, position: newPosition, ...(status ? { status } : {}) } : c)),
    );
    try {
      const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "reorder_card", {
        id: entityId,
        newPosition,
        status: status ?? null,
      });
      if (card) get().upsertCard(globalize(card, connId));
      return card;
    } catch (e) {
      await get().loadCards();
      throw e;
    }
  },

  deleteCard: async (id) => {
    const { connId, entityId } = parseGlobalId(id);
    const success = await connectionManager.invokeOne<boolean>(connId, "delete_card", { id: entityId });
    if (success) {
      commitCards(
        set,
        get,
        get().cards.filter((c) => c.id !== id),
      );
    }
    return success;
  },

  trashCard: async (id) => {
    const { connId, entityId } = parseGlobalId(id);
    const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "trash_card", { id: entityId });
    if (card) get().upsertCard(globalize(card, connId));
    return card;
  },

  restoreCard: async (id, status) => {
    const { connId, entityId } = parseGlobalId(id);
    const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "restore_card", {
      id: entityId,
      status: status ?? null,
    });
    if (card) get().upsertCard(globalize(card, connId));
    return card;
  },

  addRevisionNote: async (id, note) => {
    const { connId, entityId } = parseGlobalId(id);
    const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "add_revision_note", {
      input: { id: entityId, note },
    });
    if (card) get().upsertCard(globalize(card, connId));
    return card;
  },

  answerFeedback: async (id, answer) => {
    const { connId, entityId } = parseGlobalId(id);
    const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "answer_feedback", {
      input: { id: entityId, answer },
    });
    if (card) get().upsertCard(globalize(card, connId));
    return card;
  },

  launchAgent: async (cardId, workingDir) => {
    const { connId, entityId } = parseGlobalId(cardId);
    try {
      const result = await connectionManager.invokeOne<LaunchResult>(connId, "launch_agent", {
        input: { cardId: entityId, workingDir: workingDir ?? null },
      });
      const now = new Date().toISOString();
      commitCards(
        set,
        get,
        get().cards.map((card) =>
          card.id === cardId
            ? result.queued
              ? { ...card, agentQueued: true, updatedAt: now }
              : {
                  ...card,
                  status: "in_progress",
                  agentQueued: false,
                  agentRunId: result.runId,
                  agentRunStartedAt: now,
                  agentRunEndedAt: undefined,
                  agentResult: undefined,
                  agentQuestion: undefined,
                  updatedAt: now,
                }
            : card,
        ),
      );
      const launched = get().cards.find((c) => c.id === cardId);
      track("agent_launch", {
        card_id: cardId,
        run_id: result.runId,
        queued: result.queued,
        has_working_dir: !!workingDir,
        ...(launched ? agentProps(launched, get().presets) : {}),
      });
      return result;
    } catch (e) {
      await get().loadCards();
      throw e;
    }
  },

  cancelAgent: async (cardId) => {
    set({ cancellingIds: new Set(get().cancellingIds).add(cardId) });
    const drop = () => {
      const next = new Set(get().cancellingIds);
      next.delete(cardId);
      set({ cancellingIds: next });
    };
    try {
      const { connId, entityId } = parseGlobalId(cardId);
      const stopped = await connectionManager.invokeOne<boolean>(connId, "cancel_agent", { cardId: entityId });
      track("agent_cancel", { card_id: cardId, stopped });
      // Nothing was actually running — drop the optimistic flag so the card
      // doesn't stay stuck on "Stopping…".
      if (!stopped) drop();
      return stopped;
    } catch (e) {
      drop();
      throw e;
    }
  },
}));

// ── Live wiring ──────────────────────────────────────────────────────────────
// Subscribed once for the whole app on first store use. Kept for the app's
// lifetime (connectionManager listeners are process-global anyway).

let liveUnsubs: Array<() => void> = [];
// Serialise concurrent subscribeLive calls so rapid topology changes (e.g. hub
// reconnecting while the local server restarts) never leave two active listener
// sets running in parallel. Each call chains onto the previous one; once the
// prior subscribe has fully resolved its unsubs are in place before the new one
// tears them down.
let subscribeChain: Promise<void> = Promise.resolve();

async function doSubscribeLive() {
  for (const off of liveUnsubs) off();
  liveUnsubs = [];
  const store = useBoardStore.getState();
  try {
    const offResult = await connectionManager.listenAll<AgentResultEvent>(
      "agent-result-changed",
      ({ connId, payload }) => {
        const card = payload.card;
        // `failed` runs are parked back in the Todo column by applyResult.
        const failed = card.status === "todo";
        const duration_ms =
          card.agentRunEndedAt && card.agentRunStartedAt
            ? Date.parse(card.agentRunEndedAt) - Date.parse(card.agentRunStartedAt)
            : undefined;
        track(failed ? "agent_run_failed" : "agent_run_completed", {
          card_id: toGlobalId(connId, card.id),
          final_status: card.status,
          has_question: !!card.agentQuestion,
          duration_ms,
        });
        store.upsertCard(globalize(card, connId));
      },
    );
    liveUnsubs.push(offResult);
  } catch (e) {
    console.error("Failed to subscribe agent-result-changed:", e);
    captureError(e, { where: "boardStore.subscribeLive.result" });
  }
  try {
    const offLog = await connectionManager.listenAll<AgentLogEvent>("agent-log-appended", ({ connId, payload }) => {
      store.appendLog(toGlobalId(connId, payload.cardId), payload.line);
    });
    liveUnsubs.push(offLog);
  } catch (e) {
    console.error("Failed to subscribe agent-log-appended:", e);
    captureError(e, { where: "boardStore.subscribeLive.log" });
  }
}

function subscribeLive(): void {
  subscribeChain = subscribeChain.then(doSubscribeLive);
}

/** Start the board's data load + live subscriptions exactly once. Idempotent —
 * safe to call from every consumer's mount effect. */
export function ensureBoardLive() {
  if (useBoardStore.getState().live) return;
  useBoardStore.setState({ live: true });
  void useBoardStore.getState().loadCards();
  void subscribeLive();
  // Reload + re-subscribe when the set of connections changes.
  connectionManager.onTopologyChange(() => {
    void useBoardStore.getState().loadCards();
    void subscribeLive();
  });
}

import { create } from "zustand";

/**
 * Bridges app-wide keyboard shortcut detection (mounted in the (main) layout)
 * with the action owners (KanbanPage). Each `request*` bumps a nonce so the
 * subscribing page re-fires the effect even on repeated presses.
 */
type ShortcutStore = {
  // Persistent flag (not a nonce): survives navigation so the kanban page can
  // consume it on mount when "New task" is triggered from another route.
  pendingNewCard: boolean;
  // Persistent flag: survives navigation so the schedules page can open the
  // new-schedule dialog on mount when triggered from another route / the menu.
  pendingNewSchedule: boolean;
  focusSearchNonce: number;
  cancelNonce: number;
  requestNewCard: () => void;
  consumeNewCard: () => void;
  requestNewSchedule: () => void;
  consumeNewSchedule: () => void;
  requestFocusSearch: () => void;
  requestCancel: () => void;
};

export const useShortcutStore = create<ShortcutStore>((set) => ({
  pendingNewCard: false,
  pendingNewSchedule: false,
  focusSearchNonce: 0,
  cancelNonce: 0,
  requestNewCard: () => set({ pendingNewCard: true }),
  consumeNewCard: () => set({ pendingNewCard: false }),
  requestNewSchedule: () => set({ pendingNewSchedule: true }),
  consumeNewSchedule: () => set({ pendingNewSchedule: false }),
  requestFocusSearch: () =>
    set((state) => ({ focusSearchNonce: state.focusSearchNonce + 1 })),
  requestCancel: () => set((state) => ({ cancelNonce: state.cancelNonce + 1 })),
}));

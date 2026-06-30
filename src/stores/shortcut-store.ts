import { create } from "zustand";

/**
 * Bridges app-wide keyboard shortcut detection (mounted in the (main) layout)
 * with the action owners. Each `request*` bumps a nonce so the subscribing page
 * re-fires the effect even on repeated presses.
 */
type ShortcutStore = {
  // Persistent flag: survives navigation so the schedules page can open the
  // new-schedule dialog on mount when triggered from another route / the menu.
  pendingNewSchedule: boolean;
  focusSearchNonce: number;
  cancelNonce: number;
  requestNewSchedule: () => void;
  consumeNewSchedule: () => void;
  requestFocusSearch: () => void;
  requestCancel: () => void;
};

export const useShortcutStore = create<ShortcutStore>((set) => ({
  pendingNewSchedule: false,
  focusSearchNonce: 0,
  cancelNonce: 0,
  requestNewSchedule: () => set({ pendingNewSchedule: true }),
  consumeNewSchedule: () => set({ pendingNewSchedule: false }),
  requestFocusSearch: () =>
    set((state) => ({ focusSearchNonce: state.focusSearchNonce + 1 })),
  requestCancel: () => set((state) => ({ cancelNonce: state.cancelNonce + 1 })),
}));

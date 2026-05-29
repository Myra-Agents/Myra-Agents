import { create } from "zustand";

/**
 * Bridges app-wide keyboard shortcut detection (mounted in the (main) layout)
 * with the action owners (KanbanPage). Each `request*` bumps a nonce so the
 * subscribing page re-fires the effect even on repeated presses.
 */
type ShortcutStore = {
  newCardNonce: number;
  focusSearchNonce: number;
  cancelNonce: number;
  requestNewCard: () => void;
  requestFocusSearch: () => void;
  requestCancel: () => void;
};

export const useShortcutStore = create<ShortcutStore>((set) => ({
  newCardNonce: 0,
  focusSearchNonce: 0,
  cancelNonce: 0,
  requestNewCard: () => set((state) => ({ newCardNonce: state.newCardNonce + 1 })),
  requestFocusSearch: () => set((state) => ({ focusSearchNonce: state.focusSearchNonce + 1 })),
  requestCancel: () => set((state) => ({ cancelNonce: state.cancelNonce + 1 })),
}));

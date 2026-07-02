import { create } from "zustand";

/**
 * Bridges app-wide keyboard shortcut detection (mounted in the (main) layout)
 * with the action owners. Each `request*` bumps a nonce so the subscribing page
 * re-fires the effect even on repeated presses.
 */
type ShortcutStore = {
  focusSearchNonce: number;
  cancelNonce: number;
  requestFocusSearch: () => void;
  requestCancel: () => void;
};

export const useShortcutStore = create<ShortcutStore>((set) => ({
  focusSearchNonce: 0,
  cancelNonce: 0,
  requestFocusSearch: () => set((state) => ({ focusSearchNonce: state.focusSearchNonce + 1 })),
  requestCancel: () => set((state) => ({ cancelNonce: state.cancelNonce + 1 })),
}));

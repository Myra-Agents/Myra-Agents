import { useEffect } from "react";

import { create } from "zustand";

/**
 * Lets a route intercept in-app history navigation (the top-bar back/forward
 * chevrons) when it has unsaved state — e.g. the schedule editor confirms before
 * discarding edits. While a guard is registered and `block()` returns true, the
 * nav controls call `onBlocked(proceed)` instead of navigating; the route shows
 * its own confirmation and runs `proceed()` if the user agrees. Cleared
 * automatically when the owning page unmounts.
 */
export type NavGuard = {
  /** Returns true when navigation should be intercepted (e.g. unsaved edits). */
  block: () => boolean;
  /** Called in place of the navigation; `proceed` performs the original nav. */
  onBlocked: (proceed: () => void) => void;
};

type NavGuardStore = {
  guard: NavGuard | null;
  setGuard: (guard: NavGuard | null) => void;
};

export const useNavGuardStore = create<NavGuardStore>((set) => ({
  guard: null,
  setGuard: (guard) => set({ guard }),
}));

/** Register a navigation guard for the lifetime of the calling component. */
export function useNavGuard(guard: NavGuard) {
  const setGuard = useNavGuardStore((s) => s.setGuard);
  const { block, onBlocked } = guard;
  useEffect(() => {
    setGuard({ block, onBlocked });
    return () => setGuard(null);
  }, [block, onBlocked, setGuard]);
}

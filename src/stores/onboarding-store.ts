import { create } from "zustand";

import { isOnboardingComplete } from "@/lib/onboarding.client";

/**
 * Whether the onboarding wizard is on screen. A store rather than local state
 * in <OnboardingBootstrap /> so Settings can replay the wizard on demand — the
 * gate only ever reads the localStorage flag once, at mount, and would not
 * notice a later change.
 *
 * Hydrated after mount, never at module scope: the static export prerenders
 * this with no `window`.
 */
type OnboardingStore = {
  open: boolean;
  /** Read the first-run flag and open the wizard if it has never completed. */
  hydrate: () => void;
  /** Show the wizard again from Settings, whatever the flag says. */
  replay: () => void;
  close: () => void;
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  open: false,
  hydrate: () => set({ open: !isOnboardingComplete() }),
  replay: () => set({ open: true }),
  close: () => set({ open: false }),
}));

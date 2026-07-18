"use client";

import { useEffect } from "react";

import { useOnboardingStore } from "@/stores/onboarding-store";

import { OnboardingWizard } from "./onboarding-wizard";

/**
 * First-run gate for the onboarding wizard. Reads the localStorage completion
 * flag *after* mount (never during SSR/static export, where `window` is absent)
 * so the static Tauri build hydrates cleanly, then shows the wizard once for a
 * fresh install. Mounted globally from the (main) layout.
 *
 * Visibility lives in {@link useOnboardingStore} rather than local state so
 * Settings can replay the wizard without a reload.
 */
export function OnboardingBootstrap() {
  const open = useOnboardingStore((s) => s.open);
  const hydrate = useOnboardingStore((s) => s.hydrate);
  const close = useOnboardingStore((s) => s.close);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!open) return null;
  return <OnboardingWizard onClose={close} />;
}

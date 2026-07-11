"use client";

import { useCallback, useEffect, useState } from "react";

import { isOnboardingComplete } from "@/lib/onboarding.client";

import { OnboardingWizard } from "./onboarding-wizard";

/**
 * First-run gate for the onboarding wizard. Reads the localStorage completion
 * flag *after* mount (never during SSR/static export, where `window` is absent)
 * so the static Tauri build hydrates cleanly, then shows the wizard once for a
 * fresh install. Mounted globally from the (main) layout.
 */
export function OnboardingBootstrap() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isOnboardingComplete()) setShow(true);
  }, []);

  const handleClose = useCallback(() => setShow(false), []);

  if (!show) return null;
  return <OnboardingWizard onClose={handleClose} />;
}

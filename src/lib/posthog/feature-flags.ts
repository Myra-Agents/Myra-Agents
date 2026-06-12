"use client";

import posthog from "posthog-js";
import { useFeatureFlagEnabled, useFeatureFlagPayload } from "posthog-js/react";

/**
 * Feature flag keys. Mirror these in the PostHog dashboard (Feature flags).
 * Centralizing the keys keeps usage typo-safe — add new flags here.
 *
 * Flags are evaluated against the registered super properties (e.g.
 * `environment`, `surface`), so you can roll a flag out to dev-only or
 * desktop-only by adding a release condition on those properties.
 */
export const FLAGS = {
  /** Example flag — replace with real ones. */
  exampleNewBoard: "example-new-board",
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];

/** React hook: is this flag enabled for the current user? `false` until loaded. */
export function useFlag(key: FlagKey): boolean {
  return useFeatureFlagEnabled(key) ?? false;
}

/** React hook: the flag's JSON payload (multivariate / remote config), or undefined. */
export function useFlagPayload(key: FlagKey): unknown {
  return useFeatureFlagPayload(key);
}

/** Imperative read outside React (false until flags have loaded). */
export function isFlagEnabled(key: FlagKey): boolean {
  return posthog.__loaded ? posthog.isFeatureEnabled(key) === true : false;
}

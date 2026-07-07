"use client";

import { useEffect } from "react";

import { loadTestResult, persistTestResult } from "@/lib/agent-test-store";
import { invoke } from "@/lib/tauri";
import type { AppSettings, BinaryStatus } from "@/types/settings";

// Module-level guard so the probe runs once per app launch, not on every route
// change that remounts the layout (and not twice under React StrictMode).
let startedThisSession = false;

/** The built-in harness ships inside the sidecar — always installed, exercised
 * by CI; auto-smoke-testing it would only slow down first launch. */
const EMBEDDED_BINARY = "myra-embedded";

/**
 * Headless one-shot probe mounted once in the app shell: any agent preset whose
 * CLI is installed but that has **never** passed a connectivity test
 * (`lastTestedAt` unset) gets `test_agent` run for it automatically, so a
 * freshly installed agent (e.g. OpenCode) is verified without the user having
 * to open Settings.
 *
 * Runs at most once per preset, ever:
 * - a pass stamps `lastTestedAt` into the saved settings (durable, per-server);
 * - a fail is recorded in the local test store (same store the Settings badge
 *   reads), which suppresses any further auto-attempt — the user retries
 *   explicitly from Settings → Agents.
 * Errors are swallowed; a failed probe must never interrupt startup.
 */
export function AgentTestBootstrap() {
  useEffect(() => {
    if (startedThisSession) return;
    startedThisSession = true;

    void (async () => {
      let agents: AppSettings["agents"];
      try {
        agents = (await invoke<Partial<AppSettings>>("get_settings")).agents ?? [];
      } catch {
        return; // no backend (plain browser dev) — nothing to test.
      }

      for (const preset of agents) {
        const binary = preset.binary.trim();
        if (!binary || binary === EMBEDDED_BINARY) continue;
        if (preset.lastTestedAt) continue; // already passed once, durable.
        if (loadTestResult(preset.id)) continue; // already attempted here (pass or fail).

        let status: BinaryStatus;
        try {
          status = await invoke<BinaryStatus>("check_binary", { binary });
        } catch {
          continue; // probe unavailable — retry on a later launch.
        }
        if (!status.found) continue; // not installed — nothing to test yet.

        try {
          // Same call the Settings "Test" button makes; resolves = passed.
          await invoke("test_agent", {
            binary,
            argsTemplate: preset.argsTemplate,
            flags: preset.flags ?? [],
            launchVia: preset.launchVia ?? "direct",
            ollamaModel: preset.ollamaModel ?? "",
            workingDir: null,
          });
        } catch (err) {
          // Guard: record the failure so this preset is never auto-retried;
          // the Settings badge surfaces it and the user retries from there.
          const reason = err instanceof Error ? err.message : typeof err === "string" ? err : undefined;
          persistTestResult(preset.id, "failed", reason);
          console.warn(`[agent-test] auto-test failed for "${preset.name}" (${binary}):`, err);
          continue;
        }
        persistTestResult(preset.id, "passed");

        try {
          // Stamp lastTestedAt on a *fresh* settings read — tests take seconds,
          // don't clobber edits made in the meantime. If the save fails the
          // local test store above still prevents an auto-retry loop here.
          const fresh = await invoke<Partial<AppSettings>>("get_settings");
          if (!fresh.agents?.some((p) => p.id === preset.id)) continue; // preset removed meanwhile.
          const stamped = {
            ...fresh,
            agents: fresh.agents.map((p) =>
              p.id === preset.id ? { ...p, lastTestedAt: new Date().toISOString() } : p,
            ),
          };
          await invoke("save_settings", { settings: stamped });
        } catch (err) {
          console.warn(`[agent-test] could not persist lastTestedAt for "${preset.name}":`, err);
        }
      }
    })();
  }, []);

  return null;
}

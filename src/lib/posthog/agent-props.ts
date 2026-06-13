import type { AgentPreset } from "@/types/settings";

interface AgentSource {
  agentPresetId?: string;
  launchVia?: "direct" | "ollama";
  ollamaModel?: string;
  agentFlags?: string[];
}

/** Pull `--model <id>` / `--model=<id>` out of the preset's extra CLI flags. */
function modelFromFlags(flags: string[] | undefined): string | null {
  if (!flags) return null;
  for (const f of flags) {
    const m = /^--model[=\s]+(.+)$/.exec(f);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Resolve which harness (agent binary) and model a card/run uses, for analytics.
 * - `harness`/`harness_name` come from the selected preset (`opencode`/`claude`/…).
 * - `model` is the local Ollama tag when launching via Ollama, otherwise the
 *   `--model` flag value when set, else null (the harness uses its own default).
 */
export function agentProps(
  src: AgentSource,
  presets: AgentPreset[],
): { harness: string | null; harness_name: string | null; launch_via: "direct" | "ollama"; model: string | null } {
  const preset = presets.find((p) => p.id === src.agentPresetId);
  const launch_via = src.launchVia ?? preset?.launchVia ?? "direct";
  const model = launch_via === "ollama" ? (src.ollamaModel ?? null) : modelFromFlags(src.agentFlags);
  return {
    harness: preset?.binary ?? null,
    harness_name: preset?.name ?? null,
    launch_via,
    model,
  };
}

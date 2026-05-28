import { useCallback, useState } from "react";
import { invoke } from "@/lib/tauri";
import type { PlannedTask } from "@/types/planner";

/**
 * Wrapper over the Rust `plan_day` command. Holds loading and error state.
 */
export function usePlanner() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (objectives: string, workingDir?: string): Promise<PlannedTask[]> => {
      setGenerating(true);
      setError(null);
      try {
        const tasks = await invoke<PlannedTask[]>("plan_day", {
          objectives,
          workingDir: workingDir?.trim() || null,
        });
        return tasks;
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        setError(msg);
        throw new Error(msg);
      } finally {
        setGenerating(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return { generate, generating, error, clearError };
}

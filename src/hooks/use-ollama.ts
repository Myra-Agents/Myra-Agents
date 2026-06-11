"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { invoke, listen } from "@/lib/tauri";
import type { OllamaPullProgress, OllamaStatus } from "@/types/settings";

/**
 * Backend-agnostic wrapper around the Ollama rpcs (`ollama_status`,
 * `ollama_install`, `ollama_serve`, `ollama_pull`, `ollama_models`,
 * `ollama_remove`). Unlike `useLocalServer` these go through the connection
 * manager's `invoke` (not the raw Tauri bridge), so they work against a local OR
 * a remote/hub backend, mirroring `check_binary`/`install_agent`.
 *
 * Pull progress is streamed: `ollama_pull` resolves only when the pull finishes,
 * but live byte progress arrives on the `ollama-pull-progress` bus event and is
 * surfaced through {@link pulling}, keyed by model tag.
 */
export function useOllama() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pulling, setPulling] = useState<Record<string, OllamaPullProgress>>({});
  // Avoid clobbering newer status writes with a slow in-flight refresh.
  const reqSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++reqSeq.current;
    try {
      const next = await invoke<OllamaStatus>("ollama_status");
      if (seq === reqSeq.current) setStatus(next);
    } catch (e) {
      console.error("[useOllama] status failed:", e);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live pull progress → `pulling[model]`. Cleared on the terminal frame.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<OllamaPullProgress>("ollama-pull-progress", ({ payload }) => {
      setPulling((prev) => {
        const next = { ...prev, [payload.model]: payload };
        if (payload.done) delete next[payload.model];
        return next;
      });
    }).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const install = useCallback(async () => {
    setBusy(true);
    try {
      const next = await invoke<OllamaStatus>("ollama_install");
      setStatus(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const serve = useCallback(async () => {
    setBusy(true);
    try {
      await invoke("ollama_serve");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const pull = useCallback(
    async (model: string) => {
      const tag = model.trim();
      if (!tag) return;
      // Seed an immediate "queued" frame so the UI shows activity pre-stream.
      setPulling((prev) => ({ ...prev, [tag]: { model: tag, status: "queued" } }));
      try {
        await invoke("ollama_pull", { model: tag });
        await refresh();
      } finally {
        setPulling((prev) => {
          const next = { ...prev };
          delete next[tag];
          return next;
        });
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (model: string) => {
      setBusy(true);
      try {
        await invoke("ollama_remove", { model });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return { status, loading, busy, pulling, refresh, install, serve, pull, remove };
}

export type UseOllama = ReturnType<typeof useOllama>;

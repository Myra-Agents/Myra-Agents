import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ollama's GitHub repo — its Releases are the source of truth for "latest Ollama
 * runtime". `releases/latest` already excludes prereleases and drafts.
 */
const OLLAMA_REPO = "ollama/ollama";
const LATEST_URL = `https://api.github.com/repos/${OLLAMA_REPO}/releases/latest`;
const CACHE_KEY = "myra.latestOllamaVersion";
/** Respect GitHub's 60 req/hr unauthenticated limit — one lookup per 6h is plenty. */
const TTL_MS = 6 * 60 * 60 * 1000;

interface Cached {
  version: string;
  fetchedAt: number;
}

/** `"v0.30.11"` → `"0.30.11"`; leaves already-bare versions untouched. */
function stripTag(tag: string): string {
  return tag.trim().replace(/^v/, "");
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    return typeof c.version === "string" && typeof c.fetchedAt === "number" ? c : null;
  } catch {
    return null;
  }
}

export interface LatestOllamaVersion {
  /** Latest published Ollama version (bare `X.Y.Z`), or `null` while unknown. */
  latest: string | null;
  /**
   * Re-check the latest release. Honors the {@link TTL_MS} cache by default, so
   * it is safe to call on a short timer; pass `force` (e.g. the user clicked
   * Refresh) to bypass the cache and hit GitHub immediately. Never throws.
   */
  refresh: (force?: boolean) => Promise<void>;
}

/**
 * The latest published Ollama version (bare `X.Y.Z`), or `null` while unknown
 * (first load, offline, rate-limited). Cached in `localStorage` for {@link TTL_MS}
 * and never throws — a `null` result means "don't render an update prompt".
 */
export function useLatestOllamaVersion(): LatestOllamaVersion {
  const [latest, setLatest] = useState<string | null>(() => readCache()?.version ?? null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (force = false) => {
    const cached = readCache();
    if (cached) {
      if (mounted.current) setLatest(cached.version);
      // Cache still warm and not forced: skip the network round-trip.
      if (!force && Date.now() - cached.fetchedAt < TTL_MS) return;
    }
    try {
      const res = await fetch(LATEST_URL, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) return; // keep cached/null; retry later
      const body = (await res.json()) as { tag_name?: string };
      if (!body.tag_name) return;
      const version = stripTag(body.tag_name);
      if (mounted.current) setLatest(version);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ version, fetchedAt: Date.now() } satisfies Cached));
      } catch {
        // localStorage unavailable — fine, we just won't cache.
      }
    } catch {
      // offline / network error — keep whatever we had.
    }
  }, []);

  // Initial load: respects the TTL cache (no GitHub hit if a fresh value exists).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { latest, refresh };
}

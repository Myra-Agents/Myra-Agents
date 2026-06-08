import { useEffect, useState } from "react";

import { stripServerTag } from "@myra/shared";

/**
 * Public dist repo whose Releases are the source of truth for "latest server
 * build". Mirrors `server-version.json`'s `repo` (that file is build-time only
 * and not bundled into the frontend, so the value is duplicated here).
 */
const DIST_REPO = "Myra-Agents/Myra-Agents-Server-Dist";
const LATEST_URL = `https://api.github.com/repos/${DIST_REPO}/releases/latest`;
const CACHE_KEY = "myra.latestServerVersion";
/** Respect GitHub's 60 req/hr unauthenticated limit — one lookup per 6h is plenty. */
const TTL_MS = 6 * 60 * 60 * 1000;

interface Cached {
  version: string;
  fetchedAt: number;
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

/**
 * The latest published server version (bare `X.Y.Z`), or `null` while unknown
 * (first load, offline, rate-limited). Cached in `localStorage` for {@link TTL_MS}
 * and never throws — a `null` result means "don't render an up-to-date badge".
 * `releases/latest` already excludes prereleases and drafts.
 */
export function useLatestServerVersion(): string | null {
  const [latest, setLatest] = useState<string | null>(() => readCache()?.version ?? null);

  useEffect(() => {
    const cached = readCache();
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      setLatest(cached.version);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(LATEST_URL, { headers: { Accept: "application/vnd.github+json" } });
        if (!res.ok) return; // keep cached/null; retry after TTL
        const body = (await res.json()) as { tag_name?: string };
        if (!body.tag_name) return;
        const version = stripServerTag(body.tag_name);
        if (cancelled) return;
        setLatest(version);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ version, fetchedAt: Date.now() } satisfies Cached));
        } catch {
          // localStorage unavailable — fine, we just won't cache.
        }
      } catch {
        // offline / network error — keep whatever we had.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return latest;
}

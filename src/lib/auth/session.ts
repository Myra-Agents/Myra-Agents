import { type AccountInfo, AUTH_ROUTES, type AuthTokens, type SessionClaims } from "@myra/shared";

import { getClerkToken, signOutOfClerk } from "./clerk";

/**
 * The hub-session authority for the managed cloud hub. Clerk proves identity
 * once; the hub then issues a short **session** JWT + a long, single-use
 * **refresh** token. This module owns their lifecycle for both web and desktop:
 *  - web exchanges a Clerk token (`exchange`),
 *  - desktop claims tokens minted by the bridge page (`setFromDesktopClaim`),
 *  - both auto-refresh (`getValidSessionToken`) and `signOut`.
 * Persisted to localStorage so a reload stays signed in; emits a change event so
 * entitlement + the board re-render.
 */

const HUB_URL = process.env.NEXT_PUBLIC_MYRA_HUB_URL?.replace(/\/$/, "") || "";
const STORAGE_KEY = "myra.auth";
/** Refresh when the session has under this many seconds left. */
const REFRESH_SKEW_S = 60;

interface StoredAuth {
  session: string;
  refresh: string;
  account: AccountInfo;
}

let state: StoredAuth | null = load();
const listeners = new Set<() => void>();

function load(): StoredAuth | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function persist(next: StoredAuth | null): void {
  state = next;
  if (typeof localStorage !== "undefined") {
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable — keep in-memory for this session.
    }
  }
  for (const cb of listeners) cb();
}

/** Decode a JWT payload without verifying (client trusts its own stored token). */
function decodeClaims(jwt: string): SessionClaims | null {
  try {
    const [, payload] = jwt.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as SessionClaims;
  } catch {
    return null;
  }
}

function accountFromTokens(tokens: AuthTokens, fallback?: AccountInfo): AccountInfo {
  const claims = decodeClaims(tokens.session);
  if (!claims) return fallback ?? { userId: "unknown", tier: "free", role: "member" };
  return { userId: claims.sub, tier: claims.tier, role: claims.role, orgId: claims.orgId, email: fallback?.email };
}

function configured(): boolean {
  return HUB_URL.length > 0;
}

async function post<T>(path: string, body: unknown, bearer?: string): Promise<T> {
  const res = await fetch(`${HUB_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;
  if (!json?.ok) throw new Error(json?.error ?? `${path} failed (${res.status})`);
  return json.data as T;
}

// --- public API -------------------------------------------------------------

/** The managed cloud hub's base URL (empty when unconfigured). Used by health probes. */
export function hubBaseUrl(): string {
  return HUB_URL;
}

export function isAuthConfigured(): boolean {
  return configured();
}

export function getAccount(): AccountInfo | null {
  return state?.account ?? null;
}

export function isAuthenticated(): boolean {
  return state !== null;
}

export function getSessionToken(): string | null {
  return state?.session ?? null;
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Web login: exchange the current Clerk token for hub tokens. */
export async function exchange(): Promise<boolean> {
  if (!configured()) return false;
  const clerkToken = await getClerkToken();
  if (!clerkToken) return false;
  const data = await post<AuthTokens & { account: AccountInfo }>(AUTH_ROUTES.exchange, {}, clerkToken);
  persist({ session: data.session, refresh: data.refresh, account: data.account });
  return true;
}

/**
 * Bridge-page side of desktop login: with a live Clerk session, mint hub tokens
 * and stash them under a one-time code the desktop app then claims. Returns the
 * code to deep-link back as `myra://auth/callback?code=…`.
 */
export async function requestDesktopHandoff(): Promise<string> {
  if (!configured()) throw new Error("hub not configured");
  const clerkToken = await getClerkToken();
  if (!clerkToken) throw new Error("not signed in");
  const data = await post<{ code: string }>(AUTH_ROUTES.desktopHandoff, {}, clerkToken);
  return data.code;
}

/** Desktop login: claim the one-time handoff code minted by the bridge page. */
export async function setFromDesktopClaim(code: string): Promise<boolean> {
  if (!configured()) return false;
  const tokens = await post<AuthTokens>(AUTH_ROUTES.desktopClaim, { code });
  persist({ session: tokens.session, refresh: tokens.refresh, account: accountFromTokens(tokens) });
  return true;
}

let refreshing: Promise<boolean> | undefined;

/** Rotate the refresh token for a fresh session. Clears auth on hard failure. */
export function refresh(): Promise<boolean> {
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = undefined));
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  if (!state) return false;
  try {
    const data = await post<AuthTokens & { account: AccountInfo }>(AUTH_ROUTES.refresh, { refresh: state.refresh });
    persist({ session: data.session, refresh: data.refresh, account: data.account });
    return true;
  } catch {
    // Refresh token invalid/expired/reused — drop the session.
    persist(null);
    return false;
  }
}

/** Current session token, refreshed first if it's missing or about to expire. */
export async function getValidSessionToken(): Promise<string | null> {
  if (!state) return null;
  const claims = decodeClaims(state.session);
  const expSoon = !claims || claims.exp - Math.floor(Date.now() / 1000) < REFRESH_SKEW_S;
  if (expSoon && !(await refresh())) return null;
  return state?.session ?? null;
}

/** Log out: revoke the refresh token, clear local auth, and sign out of Clerk. */
export async function signOut(): Promise<void> {
  const token = state?.refresh;
  persist(null);
  if (configured() && token) {
    try {
      await post(AUTH_ROUTES.logout, { refresh: token });
    } catch {
      // best-effort.
    }
  }
  try {
    await signOutOfClerk();
  } catch {
    // best-effort.
  }
}

/**
 * REST client for the hub's E2E-sync endpoints. Authenticates with the managed
 * cloud-hub session token (Bearer; one refresh-and-retry on 401), exactly like
 * `transport/hub.ts`. Sends and receives **ciphertext + public keys only** — the
 * hub never sees plaintext or the vault key.
 */

import { SYNC_ROUTES, type SyncDelta, type SyncDevice, type SyncPullResult, type WrappedKeys } from "@myra/shared";

import { getValidSessionToken, hubBaseUrl, refresh } from "@/lib/auth/session";

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const root = hubBaseUrl().replace(/\/$/, "");
  const once = async (): Promise<Response> => {
    const token = await getValidSessionToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (init.body) headers.set("content-type", "application/json");
    return fetch(`${root}${path}`, { ...init, headers });
  };
  const res = await once();
  if (res.status === 401 && (await refresh())) return once();
  return res;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(path, init);
  const env = (await res.json().catch(() => ({ ok: false, error: "bad response" }))) as Envelope<T>;
  if (!res.ok || !env.ok) throw new Error(env.error ?? `sync request failed (${res.status})`);
  return env.data as T;
}

/** True only when a cloud hub is configured (sync is unavailable otherwise). */
export function isSyncAvailable(): boolean {
  return hubBaseUrl().length > 0;
}

// ── devices ───────────────────────────────────────────────────────────

export function listDevices(): Promise<SyncDevice[]> {
  return call<SyncDevice[]>(SYNC_ROUTES.devices);
}

export function putDevice(device: SyncDevice): Promise<SyncDevice[]> {
  return call<SyncDevice[]>(SYNC_ROUTES.devices, { method: "POST", body: JSON.stringify(device) });
}

export function revokeDevice(deviceId: string): Promise<{ removed: boolean }> {
  return call<{ removed: boolean }>(`${SYNC_ROUTES.devices}/${encodeURIComponent(deviceId)}/revoke`, {
    method: "POST",
  });
}

// ── wrapped keys ──────────────────────────────────────────────────────

export function getWrapped(): Promise<WrappedKeys> {
  return call<WrappedKeys>(SYNC_ROUTES.wrapped);
}

export function putWrapped(wrapped: WrappedKeys): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>(SYNC_ROUTES.wrapped, { method: "PUT", body: JSON.stringify(wrapped) });
}

// ── deltas ────────────────────────────────────────────────────────────

export function pushDelta(from: string, ciphertext: string): Promise<{ seq: number }> {
  return call<{ seq: number }>(SYNC_ROUTES.push, { method: "POST", body: JSON.stringify({ from, ciphertext }) });
}

export function pullDeltas(deviceId: string): Promise<SyncPullResult> {
  return call<SyncPullResult>(`${SYNC_ROUTES.pull}?device=${encodeURIComponent(deviceId)}`);
}

export function ackDeltas(deviceId: string, seqs: number[]): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>(SYNC_ROUTES.ack, { method: "POST", body: JSON.stringify({ device: deviceId, seqs }) });
}

export type { SyncDelta };

/**
 * Per-device key lifecycle for E2E sync.
 *
 * Each device owns one X25519 keypair. The **private key lives in the OS keychain**
 * via the app-level `keychain_*` Tauri commands (not the sidecar — sync is an app
 * concern and must work with no board running). The public key is published to the
 * hub so other devices can wrap the vault key to it; the private key never leaves
 * this machine.
 *
 * The `deviceId` is derived from the public key (first 8 bytes of its SHA-256, hex)
 * so it's stable and needs no separate storage.
 */

import { sha256 } from "@noble/hashes/sha256";

import { isTauri } from "@/lib/tauri";

import { fromBase64, generateKeyPair, type KeyPair, publicKeyFor, toBase64 } from "./crypto";

/** Keychain account holding this device's base64 X25519 private key. */
const DEVICE_SK_KEY = "sync:device:sk";

export interface DeviceIdentity {
  deviceId: string;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Stable device id derived from the public key. */
export function deviceIdFor(publicKey: Uint8Array): string {
  return toHex(sha256(publicKey).subarray(0, 8));
}

// E2E sync is disabled — the OS keychain layer it relied on was removed. These
// wrappers throw so any stray call surfaces clearly instead of corrupting state.
const SYNC_DISABLED = "E2E sync is disabled (OS keychain support was removed).";
async function keychainGet(_key: string): Promise<string | null> {
  throw new Error(SYNC_DISABLED);
}
async function keychainSet(_key: string, _value: string): Promise<void> {
  throw new Error(SYNC_DISABLED);
}
async function keychainDelete(_key: string): Promise<void> {
  throw new Error(SYNC_DISABLED);
}

function requireDesktop(): void {
  if (!isTauri()) throw new Error("E2E sync requires the desktop app (keychain access).");
}

/**
 * Load this device's keypair from the keychain, generating + persisting one on
 * first use. Idempotent — repeated calls return the same identity.
 */
export async function ensureDeviceIdentity(): Promise<DeviceIdentity> {
  requireDesktop();
  const existing = await keychainGet(DEVICE_SK_KEY);
  if (existing) {
    const secretKey = fromBase64(existing);
    const publicKey = publicKeyFor(secretKey);
    return { deviceId: deviceIdFor(publicKey), publicKey, secretKey };
  }
  const kp: KeyPair = generateKeyPair();
  await keychainSet(DEVICE_SK_KEY, toBase64(kp.secretKey));
  return { deviceId: deviceIdFor(kp.publicKey), publicKey: kp.publicKey, secretKey: kp.secretKey };
}

/** This device's identity if it has already been set up, else null (no keygen). */
export async function loadDeviceIdentity(): Promise<DeviceIdentity | null> {
  if (!isTauri()) return null;
  const existing = await keychainGet(DEVICE_SK_KEY);
  if (!existing) return null;
  const secretKey = fromBase64(existing);
  const publicKey = publicKeyFor(secretKey);
  return { deviceId: deviceIdFor(publicKey), publicKey, secretKey };
}

/** Forget this device's key (leaving sync — the hub entry is revoked separately). */
export async function clearDeviceIdentity(): Promise<void> {
  if (!isTauri()) return;
  await keychainDelete(DEVICE_SK_KEY);
}

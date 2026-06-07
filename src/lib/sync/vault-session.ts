/**
 * High-level sync session: the flows the UI drives (set up · join · unlock ·
 * revoke) composed over {@link module:device}, {@link module:vault}, and
 * {@link module:hub-sync}. The unlocked vault key is held **in memory only** for
 * the session — never persisted, never sent to the hub.
 */

import type { SyncDevice } from "@myra/shared";

import { fromBase64, generateRecoveryCode as newRecoveryCode, toBase64 } from "./crypto";
import { clearDeviceIdentity, type DeviceIdentity, ensureDeviceIdentity, loadDeviceIdentity } from "./device";
import * as hub from "./hub-sync";
import {
  createVaultKey,
  type DeviceRecipient,
  RECOVERY_RECIPIENT,
  unwrapVaultKey,
  unwrapWithRecoveryCode,
  type WrappedKeys,
  wrapToPublicKey,
  wrapVaultKey,
} from "./vault";

/** The vault key for this session, once unlocked. Memory-only. */
let sessionVaultKey: Uint8Array | null = null;

export function isUnlocked(): boolean {
  return sessionVaultKey !== null;
}

export function vaultKey(): Uint8Array {
  if (!sessionVaultKey) throw new Error("vault is locked — set up or unlock sync first");
  return sessionVaultKey;
}

export function lock(): void {
  sessionVaultKey = null;
}

export interface SyncStatus {
  available: boolean;
  /** This device has a keypair AND a wrapped vault key on the hub. */
  enrolled: boolean;
  unlocked: boolean;
  deviceId: string | null;
  devices: SyncDevice[];
}

/** Snapshot the current sync state for the UI. */
export async function getStatus(): Promise<SyncStatus> {
  if (!hub.isSyncAvailable()) {
    return { available: false, enrolled: false, unlocked: false, deviceId: null, devices: [] };
  }
  const id = await loadDeviceIdentity();
  let devices: SyncDevice[] = [];
  let enrolled = false;
  if (id) {
    devices = await hub.listDevices().catch(() => []);
    enrolled = devices.some((d) => d.deviceId === id.deviceId);
  }
  return {
    available: true,
    enrolled,
    unlocked: isUnlocked(),
    deviceId: id?.deviceId ?? null,
    devices,
  };
}

function recipient(id: DeviceIdentity, label: string): SyncDevice {
  return { deviceId: id.deviceId, pubkey: toBase64(id.publicKey), label, addedAt: Date.now() };
}

/**
 * First-device setup: generate this device's key, mint a fresh vault key +
 * recovery code, publish the device, and store the wrapped keys on the hub.
 * Returns the recovery code to show **once**.
 */
export async function setUpSync(label: string): Promise<{ recoveryCode: string }> {
  const id = await ensureDeviceIdentity();
  const recoveryCode = newRecoveryCode();
  const vk = createVaultKey();
  const wrapped = wrapVaultKey(vk, [{ deviceId: id.deviceId, publicKey: id.publicKey }], recoveryCode);
  await hub.putDevice(recipient(id, label));
  await hub.putWrapped(wrapped);
  sessionVaultKey = vk;
  return { recoveryCode };
}

/**
 * Unlock on a device that's already enrolled: open its wrapped vault key with
 * the device private key. No hub writes.
 */
export async function unlockExisting(): Promise<void> {
  const id = await ensureDeviceIdentity();
  const wrapped = await hub.getWrapped();
  const sealed = wrapped[id.deviceId];
  if (!sealed) throw new Error("this device isn't enrolled — join with a recovery code");
  sessionVaultKey = unwrapVaultKey(sealed, id.secretKey);
}

/**
 * Join from a new device using the recovery code: recover the vault key offline,
 * then re-wrap it to this device's key and publish the device so future deltas
 * can target it directly.
 */
export async function joinWithRecovery(code: string, label: string): Promise<void> {
  const id = await ensureDeviceIdentity();
  const wrapped = await hub.getWrapped();
  const vk = unwrapWithRecoveryCode(wrapped, code);
  wrapped[id.deviceId] = wrapToPublicKey(vk, id.publicKey);
  await hub.putDevice(recipient(id, label));
  await hub.putWrapped(wrapped);
  sessionVaultKey = vk;
}

/**
 * Revoke a device. For real forward secrecy this **rotates the vault key**: a new
 * key is wrapped only to the remaining devices + a fresh recovery code, so the
 * revoked device's old wrapped copy is useless for future deltas. Requires this
 * device to be unlocked (it must re-wrap). Returns the new recovery code.
 */
export async function revokeDevice(targetDeviceId: string): Promise<{ recoveryCode: string }> {
  if (!sessionVaultKey) throw new Error("unlock sync before revoking a device");
  const devices = (await hub.listDevices()).filter((d) => d.deviceId !== targetDeviceId);
  const recoveryCode = newRecoveryCode();
  const rotated = createVaultKey();
  const recipients: DeviceRecipient[] = devices.map((d) => ({
    deviceId: d.deviceId,
    publicKey: fromBase64(d.pubkey),
  }));
  const wrapped: WrappedKeys = wrapVaultKey(rotated, recipients, recoveryCode);
  await hub.putWrapped(wrapped);
  await hub.revokeDevice(targetDeviceId); // drops its hub queue + device record
  sessionVaultKey = rotated;
  return { recoveryCode };
}

/** Leave sync on this device: forget the local key (revoke it on the hub too). */
export async function leaveSync(): Promise<void> {
  const id = await loadDeviceIdentity();
  if (id) await hub.revokeDevice(id.deviceId).catch(() => undefined);
  await clearDeviceIdentity();
  lock();
}

export { RECOVERY_RECIPIENT };

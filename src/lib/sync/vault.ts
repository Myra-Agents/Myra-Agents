/**
 * Vault-key orchestration: create, wrap/unwrap, rotate, and the payload
 * encrypt/decrypt used for sync deltas. Pure (no I/O) — {@link module:sync} does
 * the hub transport, this just composes {@link module:crypto}.
 *
 * The **vault key** is a random 256-bit symmetric key that encrypts every sync
 * payload. It is wrapped (sealed box) to each device's public key *and* to a
 * one-time recovery code, so any device — or a fresh device with just the
 * recovery code — can recover it. The hub stores only the wrapped (ciphertext)
 * copies and never the key itself.
 */

import {
  fromBase64,
  fromUtf8,
  generateVaultKey,
  keyPairFromRecoveryCode,
  sealedBoxOpen,
  sealedBoxSeal,
  secretBoxOpen,
  secretBoxSeal,
  toBase64,
  toUtf8,
} from "./crypto";

/** `recipient → base64(sealed vault key)`. Recipient is a `deviceId` or `"recovery"`. */
export type WrappedKeys = Record<string, string>;

export const RECOVERY_RECIPIENT = "recovery";

/** A device the vault key must be (re)wrapped to. */
export interface DeviceRecipient {
  deviceId: string;
  publicKey: Uint8Array;
}

/** A fresh vault key (first device, or a rotation). */
export function createVaultKey(): Uint8Array {
  return generateVaultKey();
}

/** Wrap the vault key to one recipient public key. */
export function wrapToPublicKey(vaultKey: Uint8Array, recipientPublicKey: Uint8Array): string {
  return toBase64(sealedBoxSeal(recipientPublicKey, vaultKey));
}

/** Unwrap the vault key with a device's (or recovery) secret key. Throws on mismatch. */
export function unwrapVaultKey(sealedB64: string, secretKey: Uint8Array): Uint8Array {
  return sealedBoxOpen(secretKey, fromBase64(sealedB64));
}

/**
 * Wrap the vault key to every device + the recovery code, producing the full
 * `wrappedKeys` map to PUT on the hub. Used on setup and on every rotation.
 */
export function wrapVaultKey(vaultKey: Uint8Array, devices: DeviceRecipient[], recoveryCode: string): WrappedKeys {
  const wrapped: WrappedKeys = {};
  for (const d of devices) wrapped[d.deviceId] = wrapToPublicKey(vaultKey, d.publicKey);
  wrapped[RECOVERY_RECIPIENT] = wrapToPublicKey(vaultKey, keyPairFromRecoveryCode(recoveryCode).publicKey);
  return wrapped;
}

/** Recover the vault key from the recovery code + the hub's wrapped copy. */
export function unwrapWithRecoveryCode(wrapped: WrappedKeys, recoveryCode: string): Uint8Array {
  const sealed = wrapped[RECOVERY_RECIPIENT];
  if (!sealed) throw new Error("no recovery-wrapped vault key on the hub");
  return unwrapVaultKey(sealed, keyPairFromRecoveryCode(recoveryCode).secretKey);
}

// ── payload (delta) encryption ────────────────────────────────────────

/** Encrypt a JSON-serialisable payload under the vault key → base64 ciphertext. */
export function encryptPayload(vaultKey: Uint8Array, payload: unknown): string {
  return toBase64(secretBoxSeal(vaultKey, toUtf8(JSON.stringify(payload))));
}

/** Decrypt a base64 ciphertext under the vault key back to its JSON payload. */
export function decryptPayload<T>(vaultKey: Uint8Array, ciphertextB64: string): T {
  return JSON.parse(fromUtf8(secretBoxOpen(vaultKey, fromBase64(ciphertextB64)))) as T;
}

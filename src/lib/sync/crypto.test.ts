/**
 * Crypto + vault unit tests. Run with `bun test src/lib/sync/crypto.test.ts`.
 * Pure — no Tauri/keychain, so it exercises the full E2E key model offline.
 */

import {
  fromBase64,
  fromUtf8,
  generateKeyPair,
  generateRecoveryCode,
  generateVaultKey,
  keyPairFromRecoveryCode,
  sealedBoxOpen,
  sealedBoxSeal,
  secretBoxOpen,
  secretBoxSeal,
  toBase64,
  toUtf8,
} from "./crypto";
import {
  createVaultKey,
  decryptPayload,
  encryptPayload,
  RECOVERY_RECIPIENT,
  unwrapVaultKey,
  unwrapWithRecoveryCode,
  wrapVaultKey,
} from "./vault";
import { describe, expect, test } from "bun:test";

describe("base64", () => {
  test("round-trips arbitrary bytes", () => {
    const b = new Uint8Array([0, 1, 2, 250, 255, 128]);
    expect([...fromBase64(toBase64(b))]).toEqual([...b]);
  });
});

describe("secret box", () => {
  test("seals and opens under the same key", () => {
    const key = generateVaultKey();
    const msg = toUtf8("the vault payload");
    const blob = secretBoxSeal(key, msg);
    expect(fromUtf8(secretBoxOpen(key, blob))).toBe("the vault payload");
  });

  test("a wrong key fails to open", () => {
    const blob = secretBoxSeal(generateVaultKey(), toUtf8("x"));
    expect(() => secretBoxOpen(generateVaultKey(), blob)).toThrow();
  });

  test("a tampered ciphertext fails", () => {
    const key = generateVaultKey();
    const blob = secretBoxSeal(key, toUtf8("x"));
    blob[blob.length - 1] ^= 0xff;
    expect(() => secretBoxOpen(key, blob)).toThrow();
  });
});

describe("sealed box", () => {
  test("only the recipient private key opens it", () => {
    const recipient = generateKeyPair();
    const stranger = generateKeyPair();
    const blob = sealedBoxSeal(recipient.publicKey, toUtf8("secret"));
    expect(fromUtf8(sealedBoxOpen(recipient.secretKey, blob))).toBe("secret");
    expect(() => sealedBoxOpen(stranger.secretKey, blob)).toThrow();
  });
});

describe("recovery code", () => {
  test("derives the same keypair on every device", () => {
    const code = generateRecoveryCode();
    const a = keyPairFromRecoveryCode(code);
    const b = keyPairFromRecoveryCode(code);
    expect([...a.publicKey]).toEqual([...b.publicKey]);
    expect([...a.secretKey]).toEqual([...b.secretKey]);
  });

  test("is tolerant of dashes/case/ambiguous chars", () => {
    const code = generateRecoveryCode();
    const messy = code.toLowerCase().replace(/-/g, " ");
    expect([...keyPairFromRecoveryCode(messy).publicKey]).toEqual([...keyPairFromRecoveryCode(code).publicKey]);
  });

  test("different codes derive different keys", () => {
    const a = keyPairFromRecoveryCode(generateRecoveryCode());
    const b = keyPairFromRecoveryCode(generateRecoveryCode());
    expect([...a.publicKey]).not.toEqual([...b.publicKey]);
  });
});

describe("vault key model", () => {
  test("every device + recovery can unwrap the vault key", () => {
    const vaultKey = createVaultKey();
    const dev1 = generateKeyPair();
    const dev2 = generateKeyPair();
    const recovery = generateRecoveryCode();
    const wrapped = wrapVaultKey(
      vaultKey,
      [
        { deviceId: "d1", publicKey: dev1.publicKey },
        { deviceId: "d2", publicKey: dev2.publicKey },
      ],
      recovery,
    );
    expect([...unwrapVaultKey(wrapped.d1, dev1.secretKey)]).toEqual([...vaultKey]);
    expect([...unwrapVaultKey(wrapped.d2, dev2.secretKey)]).toEqual([...vaultKey]);
    expect([...unwrapWithRecoveryCode(wrapped, recovery)]).toEqual([...vaultKey]);
    expect(wrapped[RECOVERY_RECIPIENT]).toBeDefined();
  });

  test("a fresh device bootstraps from the recovery code alone", () => {
    const vaultKey = createVaultKey();
    const recovery = generateRecoveryCode();
    // First device wraps to itself + recovery; second device is offline.
    const wrapped = wrapVaultKey(vaultKey, [{ deviceId: "d1", publicKey: generateKeyPair().publicKey }], recovery);
    // New device has only the recovery code.
    expect([...unwrapWithRecoveryCode(wrapped, recovery)]).toEqual([...vaultKey]);
  });

  test("rotation invalidates a revoked device's old wrap", () => {
    const old = createVaultKey();
    const revoked = generateKeyPair();
    const keep = generateKeyPair();
    const recovery = generateRecoveryCode();
    const before = wrapVaultKey(
      old,
      [
        { deviceId: "revoked", publicKey: revoked.publicKey },
        { deviceId: "keep", publicKey: keep.publicKey },
      ],
      recovery,
    );
    // Revoke: new vault key, re-wrap only to remaining devices + a new recovery code.
    const rotated = createVaultKey();
    const newRecovery = generateRecoveryCode();
    const after = wrapVaultKey(rotated, [{ deviceId: "keep", publicKey: keep.publicKey }], newRecovery);
    // The revoked device still holds `old`, but can't derive the rotated key.
    expect([...unwrapVaultKey(before.revoked, revoked.secretKey)]).toEqual([...old]);
    expect(after.revoked).toBeUndefined();
    expect([...unwrapVaultKey(after.keep, keep.secretKey)]).toEqual([...rotated]);
  });
});

describe("payload encryption", () => {
  test("round-trips an instance-set delta", () => {
    const vaultKey = createVaultKey();
    const payload = { instances: { id1: { label: "#eng", secret: "xoxb-123" } }, version: 3 };
    const ct = encryptPayload(vaultKey, payload);
    expect(decryptPayload<typeof payload>(vaultKey, ct)).toEqual(payload);
  });

  test("ciphertext leaks no plaintext", () => {
    const ct = encryptPayload(createVaultKey(), { secret: "xoxb-TOPSECRET" });
    expect(ct).not.toContain("xoxb");
    expect(ct).not.toContain("TOPSECRET");
  });
});

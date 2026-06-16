/**
 * E2E sync cryptographic primitives.
 *
 * The **app is the crypto boundary**: a secret is encrypted the moment the user
 * types it, before it ever reaches a keychain or the wire, and the hub only ever
 * sees ciphertext + public keys. Everything here is pure (no I/O, no Tauri) so it
 * unit-tests standalone — key storage lives in {@link module:device} and
 * orchestration in {@link module:vault}.
 *
 * Primitives, all from audited pure-JS libs (Tauri WKWebView/WebView2 lack
 * reliable `crypto.subtle` X25519, so we never use it):
 *   - **X25519** (`@noble/curves`) for key agreement.
 *   - **XChaCha20-Poly1305** (`@noble/ciphers`) for AEAD (24-byte random nonce).
 *   - **HKDF-SHA256** (`@noble/hashes`) for key derivation.
 *
 * Two constructions are built on those:
 *   - **sealed box** — anonymous public-key encryption to a recipient pubkey
 *     (used to wrap the vault key to each device + the recovery code).
 *   - **secret box** — symmetric AEAD under the 256-bit vault key (used for the
 *     sync deltas themselves).
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/hashes/utils";

const NONCE_LEN = 24; // XChaCha20-Poly1305 nonce
const KEY_LEN = 32;
const PUB_LEN = 32;

export interface KeyPair {
  /** 32-byte X25519 private key. */
  secretKey: Uint8Array;
  /** 32-byte X25519 public key. */
  publicKey: Uint8Array;
}

// ── encoding helpers ──────────────────────────────────────────────────

const utf8 = new TextEncoder();
const utf8d = new TextDecoder();

export function toUtf8(s: string): Uint8Array {
  return utf8.encode(s);
}
export function fromUtf8(b: Uint8Array): string {
  return utf8d.decode(b);
}

/** Standard base64 (for transport on the wire). */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ── keys ──────────────────────────────────────────────────────────────

export function generateKeyPair(): KeyPair {
  const secretKey = x25519.utils.randomPrivateKey();
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function publicKeyFor(secretKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(secretKey);
}

/** A fresh random 256-bit symmetric vault key. */
export function generateVaultKey(): Uint8Array {
  return randomBytes(KEY_LEN);
}

// ── secret box (symmetric AEAD under the vault key) ───────────────────

/** Encrypt `plaintext` under `key`; output is `nonce(24) || ciphertext`. */
export function secretBoxSeal(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = randomBytes(NONCE_LEN);
  const ct = xchacha20poly1305(key, nonce).encrypt(plaintext);
  return concat(nonce, ct);
}

/** Decrypt a `nonce(24) || ciphertext` blob under `key`. Throws on tamper. */
export function secretBoxOpen(key: Uint8Array, blob: Uint8Array): Uint8Array {
  const nonce = blob.subarray(0, NONCE_LEN);
  const ct = blob.subarray(NONCE_LEN);
  return xchacha20poly1305(key, nonce).decrypt(ct);
}

// ── sealed box (anonymous PKE to a recipient public key) ──────────────

/**
 * The AEAD key for a sealed box: HKDF over the ECDH shared secret, **bound** to
 * both public keys so a ciphertext can't be replayed under a different recipient.
 */
function sealedBoxKey(shared: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, concat(ephPub, recipientPub), toUtf8("myra-sync/sealed-box/v1"), KEY_LEN);
}

/**
 * Encrypt `plaintext` to `recipientPublicKey` anonymously. Output is
 * `ephPub(32) || nonce(24) || ciphertext`. Only the holder of the matching
 * private key can open it; the sender is not identified.
 */
export function sealedBoxSeal(recipientPublicKey: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const eph = generateKeyPair();
  const shared = x25519.getSharedSecret(eph.secretKey, recipientPublicKey);
  const key = sealedBoxKey(shared, eph.publicKey, recipientPublicKey);
  const nonce = randomBytes(NONCE_LEN);
  const ct = xchacha20poly1305(key, nonce).encrypt(plaintext);
  return concat(eph.publicKey, nonce, ct);
}

/** Open a sealed box with the recipient's `secretKey`. Throws on tamper/mismatch. */
export function sealedBoxOpen(secretKey: Uint8Array, blob: Uint8Array): Uint8Array {
  const ephPub = blob.subarray(0, PUB_LEN);
  const nonce = blob.subarray(PUB_LEN, PUB_LEN + NONCE_LEN);
  const ct = blob.subarray(PUB_LEN + NONCE_LEN);
  const recipientPub = x25519.getPublicKey(secretKey);
  const shared = x25519.getSharedSecret(secretKey, ephPub);
  const key = sealedBoxKey(shared, ephPub, recipientPub);
  return xchacha20poly1305(key, nonce).decrypt(ct);
}

// ── recovery code (offline vault bootstrap) ───────────────────────────

const RECOVERY_BYTES = 20; // 160 bits of entropy
// Crockford base32 alphabet (no I, L, O, U — unambiguous when written by hand).
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Encode bytes as grouped Crockford base32 (e.g. `K7Q2-9F3M-…`). */
function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out.replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

function base32Decode(code: string): Uint8Array {
  const clean = code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A fresh, human-writable recovery code (shown once at sync setup). */
export function generateRecoveryCode(): string {
  return base32Encode(randomBytes(RECOVERY_BYTES));
}

/**
 * Deterministically derive an X25519 keypair from a recovery code. The code is
 * already high-entropy, so HKDF-SHA256 (with a fixed domain-separating salt) is
 * sufficient and reproducible across devices — a new device re-derives the same
 * keypair to unwrap the vault key offline.
 */
export function keyPairFromRecoveryCode(code: string): KeyPair {
  const seed = base32Decode(code);
  const secretKey = hkdf(sha256, seed, toUtf8("myra-sync/recovery/v1"), toUtf8("x25519-seed"), KEY_LEN);
  // Clamp happens inside x25519; HKDF output is a valid scalar seed.
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

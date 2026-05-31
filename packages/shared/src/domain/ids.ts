/** Mirrors the browser backend's id generation (crypto UUID with fallback). */
export function newId(prefix = ""): string {
  // Typed loosely so this compiles under any runtime's lib (browser / Bun / Workers).
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const id = g.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}${id}`;
}

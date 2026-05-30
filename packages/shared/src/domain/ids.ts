/** Mirrors the browser backend's id generation (crypto UUID with fallback). */
export function newId(prefix = ""): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}${id}`;
}

import type { Store } from "@myra/shared";

import { FileStore } from "./file-store";

/**
 * Pick the persistence backend from `MYRA_STORE`:
 * - unset / `file` (default) → JSON files (desktop sidecar + self-host).
 * - `sqlite` → a bun:sqlite database (managed cloud / scaling).
 *
 * The sqlite module is imported lazily so its `bun:sqlite` dependency only
 * loads when actually selected.
 */
export async function selectStore(): Promise<Store> {
  if (process.env.MYRA_STORE?.toLowerCase() === "sqlite") {
    const { SqliteStore } = await import("./sqlite-store");
    return new SqliteStore();
  }
  return new FileStore();
}

import { useState } from "react";

import { type Entitlement, resolveEntitlement } from "@/lib/entitlement";

/**
 * View of {@link resolveEntitlement}. The user connection is disabled, so
 * entitlement is now static (env-derived) — the auth subscription that used to
 * flip the board on login/logout was removed with it. Computed once on mount.
 */
export function useEntitlement(): Entitlement {
  const [entitlement] = useState<Entitlement>(() => resolveEntitlement());
  return entitlement;
}

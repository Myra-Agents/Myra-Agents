import { useEffect, useState } from "react";

import { subscribe as subscribeAuth } from "@/lib/auth/session";
import { type Entitlement, resolveEntitlement } from "@/lib/entitlement";

/**
 * Reactive view of {@link resolveEntitlement}. Re-evaluates whenever the auth
 * session changes (login / logout / refresh) so the board flips on/off without
 * a reload.
 */
export function useEntitlement(): Entitlement {
  const [entitlement, setEntitlement] = useState<Entitlement>(() => resolveEntitlement());

  useEffect(() => {
    const recompute = () => setEntitlement(resolveEntitlement());
    const off = subscribeAuth(recompute);
    recompute();
    return off;
  }, []);

  return entitlement;
}

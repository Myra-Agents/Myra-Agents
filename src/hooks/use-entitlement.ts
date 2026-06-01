import { useEffect, useState } from "react";

import { connectionManager } from "@/lib/connections/manager";
import { type Entitlement, resolveEntitlement } from "@/lib/entitlement";

/**
 * Reactive view of the {@link resolveEntitlement} stub. Re-evaluates when the
 * connection topology changes so that a web hub login (which mints a Pro
 * session) flips the board on without a reload.
 */
export function useEntitlement(): Entitlement {
  const [entitlement, setEntitlement] = useState<Entitlement>(() => resolveEntitlement());

  useEffect(() => {
    const recompute = () => setEntitlement(resolveEntitlement());
    const off = connectionManager.onTopologyChange(recompute);
    recompute();
    return off;
  }, []);

  return entitlement;
}

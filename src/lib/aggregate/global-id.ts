/**
 * Entity ids are unique only *within* a server. The aggregated client namespaces
 * every card/schedule by its origin connection so ids never collide across
 * servers and "which server owns this entity" is always answerable.
 *
 *   GlobalId = `${connId}::${entityId}`
 *
 * The board renders GlobalIds; on mutate the client splits off `connId` to pick
 * the transport and sends the bare `entityId` back to the owning server.
 */

export const GID_SEP = "::";

/** Join a connection id and a server-local entity id into a GlobalId. */
export function toGlobalId(connId: string, entityId: string): string {
  return `${connId}${GID_SEP}${entityId}`;
}

/**
 * Split a GlobalId back into its connection id and server-local entity id.
 * Splits on the first separator only (entity ids never contain it). If the id
 * carries no separator it is treated as a bare local entity id on the empty
 * connection — defensive, shouldn't happen once everything is namespaced.
 */
export function parseGlobalId(globalId: string): { connId: string; entityId: string } {
  const i = globalId.indexOf(GID_SEP);
  if (i === -1) return { connId: "", entityId: globalId };
  return {
    connId: globalId.slice(0, i),
    entityId: globalId.slice(i + GID_SEP.length),
  };
}

/** The connection id portion of a GlobalId (convenience). */
export function connIdOf(globalId: string): string {
  return parseGlobalId(globalId).connId;
}

/** The server-local entity id portion of a GlobalId (convenience). */
export function entityIdOf(globalId: string): string {
  return parseGlobalId(globalId).entityId;
}

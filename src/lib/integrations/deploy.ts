import { connectionManager } from "@/lib/connections/manager";
import type { AppSettings, PluginInstance } from "@/types/settings";

/**
 * Integration fan-out. The app holds **no** central store — an instance "lives"
 * on a machine iff that machine's `settings.pluginInstances` contains its id. So
 * deploying = writing the instance (and its secrets) into each selected backend
 * and removing it from the deselected ones, one `save_settings`/`set_plugin_secret`
 * call per connection.
 *
 * Nothing here is transactional: writing to machine A can succeed while machine C
 * fails, so every operation returns a **per-connection** {@link DeployResult} and
 * the caller surfaces partial state + retry rather than a single ok/fail.
 */

/** A secret the user typed in the wizard, to push into each selected keychain. */
export interface SecretInput {
  key: string;
  value: string;
}

/** Outcome of one connection's slice of a fan-out — never throws past this. */
export interface DeployResult {
  connId: string;
  ok: boolean;
  /** Present when `ok` is false. */
  error?: string;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Read one connection's instance map (empty when unset / unreachable). */
async function readInstances(connId: string): Promise<Record<string, PluginInstance>> {
  const settings = await connectionManager.invokeOne<Partial<AppSettings>>(connId, "get_settings");
  return settings.pluginInstances ?? {};
}

/** Merge `instance` into a connection's settings, then push the typed secrets. */
async function deployToOne(connId: string, instance: PluginInstance, secrets: SecretInput[]): Promise<void> {
  const settings = await connectionManager.invokeOne<AppSettings>(connId, "get_settings");
  const pluginInstances = { ...(settings.pluginInstances ?? {}), [instance.id]: instance };
  await connectionManager.invokeOne(connId, "save_settings", { settings: { ...settings, pluginInstances } });
  // Secrets are keyed by instance id (server scope `inst:{id}`). They can only be
  // pushed to a machine while the user has the plaintext (the keychain never reads
  // back), so a machine added later must re-enter — see the wizard's secret note.
  for (const { key, value } of secrets) {
    await connectionManager.invokeOne(connId, "set_plugin_secret", { plugin: instance.id, key, value });
  }
}

/** Drop `instanceId` from a connection's settings and clear its secrets. */
async function removeFromOne(connId: string, instanceId: string, secretKeys: string[]): Promise<void> {
  const settings = await connectionManager.invokeOne<AppSettings>(connId, "get_settings");
  if (!(settings.pluginInstances && instanceId in settings.pluginInstances) && secretKeys.length === 0) {
    return; // already absent — nothing to write.
  }
  const pluginInstances = { ...(settings.pluginInstances ?? {}) };
  delete pluginInstances[instanceId];
  await connectionManager.invokeOne(connId, "save_settings", { settings: { ...settings, pluginInstances } });
  for (const key of secretKeys) {
    // best-effort: a missing secret is not an error.
    await connectionManager
      .invokeOne(connId, "clear_plugin_secret", { plugin: instanceId, key })
      .catch(() => undefined);
  }
}

/**
 * Deploy an instance to `selectedConnIds` and remove it from every other id in
 * `allConnIds`. Returns one {@link DeployResult} per touched connection.
 *
 * `secrets` are pushed only to the selected machines; `secretKeys` are the secret
 * field names to clear on deselected machines.
 */
export async function deployInstance(opts: {
  instance: PluginInstance;
  secrets: SecretInput[];
  selectedConnIds: string[];
  allConnIds: string[];
  secretKeys: string[];
}): Promise<DeployResult[]> {
  const { instance, secrets, selectedConnIds, allConnIds, secretKeys } = opts;
  const selected = new Set(selectedConnIds);
  const tasks = allConnIds.map(async (connId): Promise<DeployResult> => {
    try {
      if (selected.has(connId)) {
        await deployToOne(connId, instance, secrets);
      } else {
        await removeFromOne(connId, instance.id, secretKeys);
      }
      return { connId, ok: true };
    } catch (e) {
      return { connId, ok: false, error: errMessage(e) };
    }
  });
  return Promise.all(tasks);
}

/** Remove an instance everywhere (delete from the gallery). */
export async function removeInstance(opts: {
  instanceId: string;
  allConnIds: string[];
  secretKeys: string[];
}): Promise<DeployResult[]> {
  const { instanceId, allConnIds, secretKeys } = opts;
  const tasks = allConnIds.map(async (connId): Promise<DeployResult> => {
    try {
      await removeFromOne(connId, instanceId, secretKeys);
      return { connId, ok: true };
    } catch (e) {
      return { connId, ok: false, error: errMessage(e) };
    }
  });
  return Promise.all(tasks);
}

/** The aggregate view the gallery renders. */
export interface InstanceAggregate {
  /** Every instance seen across the connections (last writer wins on conflict). */
  instances: Record<string, PluginInstance>;
  /** instanceId → the connection ids it is currently deployed on. */
  membership: Record<string, string[]>;
}

/**
 * Read `pluginInstances` from every connection and fold them into one view: the
 * union of instances plus, per instance, which machines carry it. Connections
 * that fail to answer are skipped (their slice just doesn't contribute).
 */
export async function aggregateInstances(connIds: string[]): Promise<InstanceAggregate> {
  const instances: Record<string, PluginInstance> = {};
  const membership: Record<string, string[]> = {};
  const perConn = await Promise.all(
    connIds.map(async (connId) => {
      try {
        return { connId, map: await readInstances(connId) };
      } catch {
        return { connId, map: {} as Record<string, PluginInstance> };
      }
    }),
  );
  for (const { connId, map } of perConn) {
    for (const [id, inst] of Object.entries(map)) {
      instances[id] = inst;
      const carriers = membership[id] ?? [];
      carriers.push(connId);
      membership[id] = carriers;
    }
  }
  return { instances, membership };
}

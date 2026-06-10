/**
 * LWW merge + targeting tests. `bun test src/lib/sync/sync.test.ts`. Pure — the
 * conflict-resolution semantics that converge two devices' edits.
 */

import type { PluginInstance } from "@/types/settings";

import { instancesForDevice, mergeSets, type SyncedInstance, type SyncedSet, tombstone } from "./sync";
import { describe, expect, test } from "bun:test";

function inst(id: string): PluginInstance {
  return { id, plugin: "slack", label: id, enabled: true, config: {} };
}

function synced(id: string, version: number, origin: string, extra: Partial<SyncedInstance> = {}): SyncedInstance {
  return { instance: inst(id), secrets: {}, targets: [], version, ts: version * 1000, origin, ...extra };
}

describe("mergeSets (LWW per instance)", () => {
  test("unions different instances", () => {
    const a: SyncedSet = { a: synced("a", 1, "d1") };
    const b: SyncedSet = { b: synced("b", 1, "d2") };
    expect(Object.keys(mergeSets(a, b)).sort()).toEqual(["a", "b"]);
  });

  test("higher version wins on the same instance", () => {
    const base: SyncedSet = { a: synced("a", 1, "d1", { secrets: { K: "old" } }) };
    const incoming: SyncedSet = { a: synced("a", 2, "d2", { secrets: { K: "new" } }) };
    expect(mergeSets(base, incoming).a.secrets.K).toBe("new");
    // older incoming does not overwrite a newer base
    expect(mergeSets(incoming, base).a.secrets.K).toBe("new");
  });

  test("ts breaks a version tie, origin breaks a ts tie (deterministic)", () => {
    const x = synced("a", 2, "aaa");
    const y = { ...synced("a", 2, "zzz"), ts: x.ts };
    // same version + ts → higher origin id wins, regardless of merge direction
    expect(mergeSets({ a: x }, { a: y }).a.origin).toBe("zzz");
    expect(mergeSets({ a: y }, { a: x }).a.origin).toBe("zzz");
  });

  test("a newer tombstone propagates a delete", () => {
    const base: SyncedSet = { a: synced("a", 1, "d1") };
    const del: SyncedSet = { a: tombstone(base.a, "d2") };
    expect(mergeSets(base, del).a.deleted).toBe(true);
  });
});

describe("instancesForDevice", () => {
  test("includes untargeted (all-device) and excludes tombstones", () => {
    const set: SyncedSet = {
      all: synced("all", 1, "d1", { targets: [] }),
      mine: synced("mine", 1, "d1", { targets: ["dev-x"] }),
      theirs: synced("theirs", 1, "d1", { targets: ["dev-y"] }),
      gone: synced("gone", 2, "d1", { deleted: true }),
    };
    const ids = instancesForDevice(set, "dev-x")
      .map((s) => s.instance.id)
      .sort();
    expect(ids).toEqual(["all", "mine"]);
  });
});

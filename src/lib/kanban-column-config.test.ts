import { columnConfigFor } from "./kanban-column-config";
import { describe, expect, test } from "bun:test";

describe("columnConfigFor", () => {
  test("returns the known column config", () => {
    expect(columnConfigFor("in_progress")).toMatchObject({
      label: "In Progress",
      accentBar: "bg-orange-500",
    });
  });

  test("falls back for an unknown runtime status", () => {
    expect(columnConfigFor("blocked_status")).toEqual({
      label: "blocked status",
      accentBar: "bg-slate-500",
    });
  });

  test("falls back for a missing runtime status", () => {
    expect(columnConfigFor(undefined)).toEqual({
      label: "Unknown",
      accentBar: "bg-slate-500",
    });
  });
});

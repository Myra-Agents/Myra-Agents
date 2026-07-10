import { type KanbanCard, STATUSES } from "@/types/kanban";

import { normalizeCardStatus, normalizeKanbanStatus } from "./kanban-status";
import { describe, expect, test } from "bun:test";

const card = (status: unknown): KanbanCard =>
  ({
    id: "card-1",
    title: "Test card",
    description: "Boundary fixture",
    status,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    tags: ["test"],
  }) as KanbanCard;

describe("normalizeKanbanStatus", () => {
  test("keeps known statuses unchanged", () => {
    for (const status of STATUSES) {
      expect(normalizeKanbanStatus(status)).toBe(status);
    }
  });

  test("maps unknown runtime statuses to todo", () => {
    expect(normalizeKanbanStatus("blocked_status")).toBe("todo");
  });

  test("does not accept inherited object keys as statuses", () => {
    expect(normalizeKanbanStatus("toString")).toBe("todo");
    expect(normalizeKanbanStatus("constructor")).toBe("todo");
  });

  test("maps missing statuses to todo", () => {
    expect(normalizeKanbanStatus(undefined)).toBe("todo");
  });

  test("maps non-string runtime values to todo", () => {
    for (const value of [null, 0, false, {}, []]) {
      expect(normalizeKanbanStatus(value)).toBe("todo");
    }
  });
});

describe("normalizeCardStatus", () => {
  test("preserves a valid card and its identity", () => {
    const source = card("done");
    expect(normalizeCardStatus(source)).toBe(source);
  });

  test("projects a malformed card into todo without mutating its other fields", () => {
    const source = card("unknown_runtime_status");
    const normalized = normalizeCardStatus(source);

    expect(normalized).not.toBe(source);
    expect(normalized).toEqual({ ...source, status: "todo" });
    expect((source as { status: unknown }).status).toBe("unknown_runtime_status");
    expect(normalized.tags).toBe(source.tags);
  });
});

import type { KanbanCard } from "@/types/kanban";

import { beforeEach, describe, expect, mock, test } from "bun:test";

const invokeAll = mock();

mock.module("@/lib/connections/manager", () => ({
  connectionManager: { invokeAll },
}));

mock.module("@/lib/posthog/events", () => ({
  captureError: mock(),
  track: mock(),
}));

mock.module("@/lib/tauri", () => ({
  isDevModeError: () => false,
}));

const { useBoardStore } = await import("./board-store");

const card = (id: string, status: unknown): KanbanCard =>
  ({
    id,
    title: id,
    description: "Boundary fixture",
    status,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    tags: [],
  }) as KanbanCard;

beforeEach(() => {
  invokeAll.mockReset();
  useBoardStore.setState({
    cards: [],
    loading: true,
    error: null,
    cancellingIds: new Set(),
    logs: new Map(),
  });
});

describe("board status boundary", () => {
  test("normalizes malformed statuses while globalizing the initial load", async () => {
    const known = card("known", "done");
    const malformed = card("malformed", "unknown_runtime_status");
    invokeAll.mockResolvedValue([{ connId: "local", data: [known, malformed] }]);

    await useBoardStore.getState().loadCards();

    expect(useBoardStore.getState().cards).toEqual([
      { ...known, id: "local::known" },
      { ...malformed, id: "local::malformed", status: "todo" },
    ]);
    expect((malformed as { status: unknown }).status).toBe("unknown_runtime_status");
    expect(useBoardStore.getState().error).toBeNull();
  });

  test("normalizes malformed live cards through the public upsert boundary", () => {
    const malformed = card("local::live", "constructor");

    useBoardStore.getState().upsertCard(malformed);

    expect(useBoardStore.getState().cards).toEqual([{ ...malformed, status: "todo" }]);
    expect((malformed as { status: unknown }).status).toBe("constructor");
  });
});

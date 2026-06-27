import { describe, expect, it } from "vitest";
import { sortTaskChecklistItems } from "../task-checklist";

describe("sortTaskChecklistItems", () => {
  it("sorts incomplete high-priority timed tasks before lower priority and completed tasks", () => {
    const items = [
      {
        id: "completed-high",
        priority: "HIGH",
        dueTime: "08:00",
        isCompleted: true,
        createdAt: "2026-06-26T01:00:00.000Z",
      },
      {
        id: "normal-early",
        priority: "NORMAL",
        dueTime: "07:00",
        isCompleted: false,
        createdAt: "2026-06-26T01:00:00.000Z",
      },
      {
        id: "high-late",
        priority: "HIGH",
        dueTime: "10:00",
        isCompleted: false,
        createdAt: "2026-06-26T01:00:00.000Z",
      },
      {
        id: "high-early",
        priority: "HIGH",
        dueTime: "08:00",
        isCompleted: false,
        createdAt: "2026-06-26T01:00:00.000Z",
      },
      {
        id: "high-untimed",
        priority: "HIGH",
        dueTime: null,
        isCompleted: false,
        createdAt: "2026-06-26T00:00:00.000Z",
      },
    ] as const;

    expect(sortTaskChecklistItems(items).map((item) => item.id)).toEqual([
      "high-early",
      "high-late",
      "high-untimed",
      "normal-early",
      "completed-high",
    ]);
  });
});

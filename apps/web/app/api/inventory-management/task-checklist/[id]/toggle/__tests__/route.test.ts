import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const findFirstMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    inventoryTaskChecklistItem: {
      findFirst: findFirstMock,
      update: updateMock,
    },
  },
}));

function post(id = "task-1", isCompleted = true) {
  return POST(
    new Request(
      `http://localhost/api/inventory-management/task-checklist/${id}/toggle`,
      {
        method: "POST",
        body: JSON.stringify({ isCompleted }),
      },
    ),
    { params: Promise.resolve({ id }) },
  );
}

describe("POST /api/inventory-management/task-checklist/[id]/toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: "store-main",
    });
    findFirstMock.mockResolvedValue({ id: "task-1", storeId: "store-main" });
    updateMock.mockResolvedValue({
      id: "task-1",
      isCompleted: true,
      completedById: "inventory-1",
      completedAt: new Date("2026-06-26T03:00:00.000Z"),
    });
  });

  it("lets inventory users complete shared checklist items with lightweight audit fields", async () => {
    const response = await post("task-1", true);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: expect.objectContaining({
        isCompleted: true,
        completedById: "inventory-1",
        completedAt: expect.any(Date),
      }),
    });
    expect(body.data.completedById).toBe("inventory-1");
  });

  it("clears completion audit fields when unchecked", async () => {
    updateMock.mockResolvedValueOnce({
      id: "task-1",
      isCompleted: false,
      completedById: null,
      completedAt: null,
    });

    const response = await post("task-1", false);

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: expect.objectContaining({
        isCompleted: false,
        completedById: null,
        completedAt: null,
      }),
    });
  });
});

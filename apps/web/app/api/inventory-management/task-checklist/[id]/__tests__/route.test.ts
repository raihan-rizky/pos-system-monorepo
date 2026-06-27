import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const findFirstMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    inventoryTaskChecklistItem: {
      findFirst: findFirstMock,
      update: updateMock,
      delete: deleteMock,
    },
  },
}));

function patch(id = "task-1") {
  return PATCH(
    new Request(`http://localhost/api/inventory-management/task-checklist/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: "Cek ulang bahan display",
        dueTime: "11:30",
        priority: "NORMAL",
      }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function destroy(id = "task-1") {
  return DELETE(
    new Request(`http://localhost/api/inventory-management/task-checklist/${id}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("/api/inventory-management/task-checklist/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      storeId: "store-main",
    });
    findFirstMock.mockResolvedValue({ id: "task-1", storeId: "store-main" });
    updateMock.mockResolvedValue({
      id: "task-1",
      title: "Cek ulang bahan display",
      dueTime: "11:30",
      priority: "NORMAL",
      updatedById: "admin-1",
    });
    deleteMock.mockResolvedValue({ id: "task-1" });
  });

  it("updates checklist item details through owner/admin management permission", async () => {
    const response = await patch();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "delete");
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: expect.objectContaining({
        title: "Cek ulang bahan display",
        dueTime: "11:30",
        priority: "NORMAL",
        updatedById: "admin-1",
      }),
    });
    expect(body.data.updatedById).toBe("admin-1");
  });

  it("deletes store-scoped checklist items through owner/admin management permission", async () => {
    const response = await destroy();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "delete");
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "task-1" } });
  });
});

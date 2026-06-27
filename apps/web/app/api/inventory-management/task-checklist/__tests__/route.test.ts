import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    inventoryTaskChecklistItem: {
      findMany: findManyMock,
      create: createMock,
    },
  },
}));

describe("/api/inventory-management/task-checklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      storeId: "store-main",
    });
    findManyMock.mockResolvedValue([
      {
        id: "task-1",
        title: "Cek rak tinta",
        periodType: "DAILY",
        periodKey: "2026-06-26",
      },
    ]);
    createMock.mockResolvedValue({
      id: "task-2",
      title: "Cek bahan finishing",
      periodType: "DAILY",
      periodKey: "2026-06-26",
      priority: "HIGH",
      dueTime: "09:00",
    });
  });

  it("lists store-scoped checklist items for the requested period", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/inventory-management/task-checklist?periodType=DAILY&periodKey=2026-06-26",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "read");
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: "store-main",
          periodType: "DAILY",
          periodKey: "2026-06-26",
        },
      }),
    );
    expect(body.data).toEqual([
      expect.objectContaining({ id: "task-1", title: "Cek rak tinta" }),
    ]);
  });

  it("creates a checklist item only through owner/admin management permission", async () => {
    const response = await POST(
      new Request("http://localhost/api/inventory-management/task-checklist", {
        method: "POST",
        body: JSON.stringify({
          periodType: "DAILY",
          periodKey: "2026-06-26",
          title: "Cek bahan finishing",
          priority: "HIGH",
          dueTime: "09:00",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "delete");
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: "store-main",
        periodType: "DAILY",
        periodKey: "2026-06-26",
        title: "Cek bahan finishing",
        priority: "HIGH",
        dueTime: "09:00",
        createdById: "admin-1",
      }),
    });
    expect(body.data.id).toBe("task-2");
  });
});

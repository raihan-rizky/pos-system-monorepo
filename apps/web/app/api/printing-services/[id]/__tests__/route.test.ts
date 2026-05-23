import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "../route";

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
    printingService: {
      findFirst: findFirstMock,
      update: updateMock,
    },
  },
  Prisma: {},
}));

describe("/api/printing-services/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Admin",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    findFirstMock.mockResolvedValue({
      id: "service-1",
      storeId: "store-main",
      name: "X Banner",
    });
    updateMock.mockResolvedValue({
      id: "service-1",
      storeId: "store-main",
      name: "X Banner Premium",
      basePrice: "75000.00",
      unit: "pcs",
      isActive: true,
    });
  });

  it("patches a service with product update permission", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/printing-services/service-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "X Banner Premium", basePrice: 75000 }),
      }),
      { params: Promise.resolve({ id: "service-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("product", "update");
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "service-1" },
      data: { name: "X Banner Premium", basePrice: 75000 },
    });
  });

  it("soft deletes a service", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/printing-services/service-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "service-1" }) },
    );

    expect(response.status).toBe(204);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "service-1" },
      data: { isActive: false },
    });
  });
});

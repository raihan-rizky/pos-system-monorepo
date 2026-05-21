import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("POST /api/inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    productFindFirstMock.mockResolvedValue({ stock: 20, costPrice: null });
    inventoryLogCreateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "log-1",
      ...data,
    }));
    productUpdateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "product-1",
      ...data,
    }));
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        product: { findFirst: productFindFirstMock, update: productUpdateMock },
        inventoryLog: { create: inventoryLogCreateMock },
      }),
    );
  });

  const validBody = {
    productId: "product-1",
    type: "IN",
    reason: "RESTOCK",
    quantity: 5,
    note: "delivery",
  };

  it("creates an APPROVED log and updates stock when the user is OWNER", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Boss",
      role: "OWNER",
      storeId: "store-main",
    });

    const response = await call(validBody);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("APPROVED");
    expect(inventoryLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          approvedBy: "owner-1",
          approverName: "Boss",
        }),
      }),
    );
    expect(productUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: 25 } }),
    );
  });

  it("creates a PENDING log and does NOT update stock when the user is ADMIN", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      name: "Ada",
      role: "ADMIN",
      storeId: "store-main",
    });

    const response = await call(validBody);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("PENDING");
    expect(inventoryLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdBy: "admin-1",
          person: "Ada",
          status: "PENDING",
          approvedBy: null,
          approverName: null,
          decidedAt: null,
        }),
      }),
    );
    expect(productUpdateMock).not.toHaveBeenCalled();
  });
});

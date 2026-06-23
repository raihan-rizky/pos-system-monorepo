import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const afterMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const sendRolePushEventMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: afterMock };
});

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/push-events", () => ({
  sendRolePushEvent: sendRolePushEventMock,
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
    afterMock.mockImplementation((callback: () => void | Promise<void>) => callback());
    sendRolePushEventMock.mockResolvedValue({
      activeCandidates: 1,
      recipients: 1,
      attempted: 1,
      sent: 1,
      failed: 0,
      deactivated: 0,
    });
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
    expect(sendRolePushEventMock).not.toHaveBeenCalled();
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
    expect(sendRolePushEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "inventory-request-created",
        storeId: "store-main",
        roles: ["OWNER", "ADMIN"],
        featureKey: "inventoryRequests",
        payload: expect.objectContaining({
          title: "Permintaan stok baru",
          url: "/products?tab=logs",
          tag: "inventory-request:log-1",
        }),
      }),
    );
  });

  it("keeps the inventory request successful when push notification fails", async () => {
    sendRolePushEventMock.mockRejectedValueOnce(new Error("Missing VAPID"));
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
    expect(sendRolePushEventMock).toHaveBeenCalledTimes(1);
  });

  it("stores the signed quantity for ADJUSTMENT, not Math.abs, so approval can subtract", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      name: "Ada",
      role: "ADMIN",
      storeId: "store-main",
    });

    const response = await call({
      productId: "product-1",
      type: "ADJUSTMENT",
      reason: "MANUAL_ADJUSTMENT",
      quantity: -5,
    });
    expect(response.status).toBe(201);

    // Create stored the signed -5, not Math.abs(-5)=5.
    const createData = inventoryLogCreateMock.mock.calls[0][0].data;
    expect(createData.quantity).toBe(-5);
    // ADMIN submissions do not move stock; only OWNER approval will.
    expect(productUpdateMock).not.toHaveBeenCalled();
  });

  it("OWNER ADJUSTMENT applies the signed delta, not Math.abs", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Boss",
      role: "OWNER",
      storeId: "store-main",
    });

    const response = await call({
      productId: "product-1",
      type: "ADJUSTMENT",
      reason: "MANUAL_ADJUSTMENT",
      quantity: -5,
    });
    expect(response.status).toBe(201);

    // Stock was 20 (default mock). After signed -5 it must be 15, not 25.
    expect(productUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: 15 } }),
    );
  });
});

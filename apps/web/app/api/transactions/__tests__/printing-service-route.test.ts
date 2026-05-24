import { beforeEach, describe, expect, it, vi } from "vitest";

const afterMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const canRolePerformActionMock = vi.hoisted(() => vi.fn());
const getGlobalRolePermissionsMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const salespersonFindFirstMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const printingServiceFindManyMock = vi.hoisted(() => vi.fn());
const transactionCountMock = vi.hoisted(() => vi.fn());
const transactionCreateMock = vi.hoisted(() => vi.fn());
const queryRawMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const sendRolePushEventMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: afterMock };
});

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: requireRoleMock,
  requirePermission: vi.fn(),
  handleAuthError: handleAuthErrorMock,
  AuthError: class AuthError extends Error {
    public statusCode: number;
    constructor(statusCode: number, message?: string) {
      super(message || "auth");
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("@/features/rbac/helpers/rbac-core", () => ({
  canRolePerformAction: canRolePerformActionMock,
}));

vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissions: getGlobalRolePermissionsMock,
}));

vi.mock("@/lib/push-events", () => ({
  sendRolePushEvent: sendRolePushEventMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    customer: {
      findFirst: customerFindFirstMock,
      update: customerUpdateMock,
    },
    salesperson: {
      findFirst: salespersonFindFirstMock,
    },
    product: {
      findMany: productFindManyMock,
    },
    printingService: {
      findMany: printingServiceFindManyMock,
    },
    transaction: {
      count: transactionCountMock,
      create: transactionCreateMock,
    },
    inventoryLog: {
      createMany: inventoryLogCreateManyMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

describe("POST /api/transactions printing service items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    afterMock.mockImplementation((cb: () => void | Promise<void>) => cb());
    requireRoleMock.mockResolvedValue({
      id: "cashier-1",
      role: "CASHIER",
      storeId: "store-main",
      name: "Cashier One",
    });
    handleAuthErrorMock.mockReturnValue(null);
    canRolePerformActionMock.mockReturnValue(true);
    getGlobalRolePermissionsMock.mockResolvedValue([]);
    customerFindFirstMock.mockResolvedValue(true);
    salespersonFindFirstMock.mockResolvedValue(true);
    productFindManyMock.mockResolvedValue([
      {
        id: "material-1",
        name: "Flexi 280",
        price: "12000.00",
        costPrice: "8000.00",
        stock: 20,
        unit: "meter",
        size: null,
        material: null,
      },
    ]);
    printingServiceFindManyMock.mockResolvedValue([
      {
        id: "service-1",
        name: "X Banner",
        basePrice: "50000.00",
        unit: "pcs",
        isActive: true,
      },
    ]);
    transactionCountMock.mockResolvedValue(0);
    transactionCreateMock.mockResolvedValue({
      id: "txn-1",
      invoiceNumber: "INV-20260523-0001",
      items: [],
    });
    queryRawMock.mockResolvedValue([{ id: "material-1" }]);
    inventoryLogCreateManyMock.mockResolvedValue({ count: 1 });
    customerUpdateMock.mockResolvedValue({});
    sendRolePushEventMock.mockResolvedValue({
      activeCandidates: 1,
      recipients: 1,
      attempted: 1,
      sent: 1,
      failed: 0,
      deactivated: 0,
    });
    dbTransactionMock.mockImplementation(async (callback: any) =>
      callback({
        transaction: { create: transactionCreateMock },
        $queryRaw: queryRawMock,
      }),
    );
  });

  it("stores service item snapshots, decrements raw material, and writes internal-use stock log", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              lineType: "PRINTING_SERVICE",
              printingServiceId: "service-1",
              name: "X Banner",
              price: 75000,
              quantity: 2,
              needsMaterial: true,
              rawMaterialProductId: "material-1",
              rawMaterialQuantity: 3,
              size: "60 x 160 cm",
              material: "Flexi 280",
              serviceNote: "Finishing glossy",
            },
          ],
          paymentMethod: "CASH",
          amountPaid: 150000,
          discount: 0,
          isJobOrder: true,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(transactionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 150000,
          total: 150000,
          items: {
            create: [
              expect.objectContaining({
                productId: null,
                printingServiceId: "service-1",
                rawMaterialProductId: "material-1",
                productName: "X Banner",
                size: "60 x 160 cm",
                material: "Flexi 280",
                serviceNote: "Finishing glossy",
                rawMaterialQuantity: 3,
                rawMaterialUnit: "meter",
                quantity: 2,
                unitPrice: 75000,
                subtotal: 150000,
              }),
            ],
          },
        }),
      }),
    );
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(sendRolePushEventMock).not.toHaveBeenCalled();
    expect(inventoryLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productId: "material-1",
          type: "OUT",
          reason: "USAGE",
          quantity: 3,
          unitCost: 8000,
          note: expect.stringContaining("Bahan layanan cetak X Banner"),
        }),
      ],
    });
  });

  it("notifies cashiers, owners, and admins when sales creates a pending transaction", async () => {
    requireRoleMock.mockResolvedValue({
      id: "sales-1",
      role: "SALES",
      storeId: "store-main",
      name: "Sales One",
    });
    transactionCreateMock.mockResolvedValue({
      id: "txn-sales-1",
      invoiceNumber: "INV-20260523-0002",
      status: "PENDING_APPROVAL",
      items: [],
      salesperson: null,
    });

    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              productId: "material-1",
              quantity: 1,
            },
          ],
          paymentMethod: "CASH",
          amountPaid: 0,
          discount: 0,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(transactionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashierId: null,
          requestedById: "sales-1",
          status: "PENDING_APPROVAL",
        }),
      }),
    );
    expect(sendRolePushEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "pending-transaction-created",
        storeId: "store-main",
        roles: ["CASHIER", "OWNER", "ADMIN"],
        featureKey: "pendingTransactions",
        payload: expect.objectContaining({
          title: "Transaksi menunggu approval",
          url: "/history",
          tag: "pending-transaction:txn-sales-1",
        }),
      }),
    );
  });

  it("keeps the sales transaction successful when push notification fails", async () => {
    sendRolePushEventMock.mockRejectedValueOnce(new Error("Missing VAPID"));
    requireRoleMock.mockResolvedValue({
      id: "sales-1",
      role: "SALES",
      storeId: "store-main",
      name: "Sales One",
    });
    transactionCreateMock.mockResolvedValue({
      id: "txn-sales-1",
      invoiceNumber: "INV-20260523-0002",
      status: "PENDING_APPROVAL",
      items: [],
      salesperson: null,
    });

    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              productId: "material-1",
              quantity: 1,
            },
          ],
          paymentMethod: "CASH",
          amountPaid: 0,
          discount: 0,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(sendRolePushEventMock).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const suratJalanFindFirstMock = vi.hoisted(() => vi.fn());
const suratJalanUpdateMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const productUpdateManyMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
}));

describe("POST /api/surat-jalan/[id]/approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productFindFirstMock.mockImplementation(async ({ where }) => ({
      id: where.id,
      stock: 10,
      stockGroupId: null,
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      stockGroup: null,
    }));
    productUpdateManyMock.mockResolvedValue({ count: 1 });
    inventoryLogCreateManyMock.mockResolvedValue({ count: 1 });
    suratJalanUpdateMock.mockImplementation(async ({ data }) => ({
      id: "sj-2",
      status: data.status,
      confirmedAt: data.confirmedAt,
    }));
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        suratJalan: {
          findFirst: suratJalanFindFirstMock,
          update: suratJalanUpdateMock,
        },
        product: {
          findFirst: productFindFirstMock,
          updateMany: productUpdateManyMock,
        },
        inventoryLog: {
          createMany: inventoryLogCreateManyMock,
        },
      }),
    );
  });

  it("approves pending surat jalan, reduces stock, and writes audit logs", async () => {
    suratJalanFindFirstMock.mockResolvedValue(makePendingSuratJalan());

    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/surat-jalan/sj-2/approval", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "sj-2" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("CONFIRMED");
    expect(productUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "product-paper", storeId: "store-main", stock: { gte: 3 } },
      data: { stock: { increment: -3 } },
    });
    expect(suratJalanUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sj-2" },
        data: expect.objectContaining({
          status: "CONFIRMED",
          approvedById: "owner-1",
          approvedByName: "Owner",
        }),
      }),
    );
    expect(inventoryLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productId: "product-paper",
          transactionId: "txn-1",
          suratJalanId: "sj-2",
          type: "OUT",
          reason: "SALE",
          quantity: 3,
        }),
      ],
    });
  });
});

function makePendingSuratJalan() {
  return {
    id: "sj-2",
    number: "TLD-14062026-002",
    transactionId: "txn-1",
    storeId: "store-main",
    status: "PENDING",
    items: [
      {
        id: "sj-item-2",
        transactionItemId: "item-paper",
        productId: "product-paper",
        productName: "Kertas A4",
        quantity: 3,
        unit: "rim",
        product: { stock: 10 },
      },
    ],
    transaction: {
      id: "txn-1",
      items: [
        {
          id: "item-paper",
          productId: "product-paper",
          quantity: 10,
        },
      ],
      suratJalan: [
        {
          id: "sj-1",
          status: "CONFIRMED",
          items: [{ transactionItemId: "item-paper", quantity: 4 }],
        },
      ],
    },
  };
}

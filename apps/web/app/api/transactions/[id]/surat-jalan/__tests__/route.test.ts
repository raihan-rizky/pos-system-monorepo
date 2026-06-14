import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const suratJalanCountMock = vi.hoisted(() => vi.fn());
const suratJalanCreateMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

async function request(body: unknown) {
  const { POST } = await import("../route");
  return POST(
    new Request("http://localhost/api/transactions/txn-1/surat-jalan", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: "txn-1" }) },
  );
}

describe("POST /api/transactions/[id]/surat-jalan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T07:00:00.000Z"));
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      name: "Cashier",
      role: "CASHIER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    suratJalanCountMock.mockResolvedValue(0);
    suratJalanCreateMock.mockImplementation(async ({ data }) => ({
      id: data.sequence === 1 ? "sj-1" : "sj-2",
      number: data.number,
      status: data.status,
      sequence: data.sequence,
      items: [],
    }));
    transactionUpdateMock.mockResolvedValue({});
    productUpdateMock.mockResolvedValue({});
    inventoryLogCreateManyMock.mockResolvedValue({ count: 4 });
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        transaction: {
          findFirst: transactionFindFirstMock,
          update: transactionUpdateMock,
        },
        suratJalan: {
          count: suratJalanCountMock,
          create: suratJalanCreateMock,
        },
        product: {
          update: productUpdateMock,
        },
        inventoryLog: {
          createMany: inventoryLogCreateManyMock,
        },
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates the first surat jalan as confirmed, reverses invoice stock, and writes delivery stock-outs", async () => {
    transactionFindFirstMock.mockResolvedValue(makeTransaction({ existingSuratJalan: [] }));

    const response = await request({
      recipientName: "Gudang PT Teladan",
      quantities: {
        "item-paper": 4,
        "item-pen": 2,
      },
      keterangan: {
        "item-paper": "Lantai 2",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("CONFIRMED");
    expect(transactionUpdateMock).toHaveBeenCalledWith({
      where: { id: "txn-1" },
      data: { stockManagedBySuratJalan: true },
    });
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "product-paper" },
      data: { stock: { increment: 10 } },
    });
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "product-paper" },
      data: { stock: { decrement: 4 } },
    });
    expect(suratJalanCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: "TLD-14062026-001",
          status: "CONFIRMED",
          sequence: 1,
          recipientName: "Gudang PT Teladan",
        }),
      }),
    );
    expect(inventoryLogCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          productId: "product-paper",
          type: "IN",
          reason: "SALE_RETURN",
          transactionId: "txn-1",
        }),
        expect.objectContaining({
          productId: "product-paper",
          type: "OUT",
          reason: "SALE",
          transactionId: "txn-1",
          suratJalanId: "sj-1",
        }),
      ]),
    });
  });

  it("creates later surat jalan as pending without changing stock", async () => {
    transactionFindFirstMock.mockResolvedValue(
      makeTransaction({
        stockManagedBySuratJalan: true,
        existingSuratJalan: [
          {
            id: "sj-1",
            number: "TLD-14062026-001",
            status: "CONFIRMED",
            recipientName: "PT Teladan",
            sequence: 1,
            requestedByName: "Cashier",
            approvedByName: "Cashier",
            createdAt: new Date("2026-06-14T04:00:00.000Z"),
            confirmedAt: new Date("2026-06-14T04:00:00.000Z"),
            items: [
              {
                id: "sj-item-1",
                transactionItemId: "item-paper",
                productId: "product-paper",
                productName: "Kertas A4",
                quantity: 4,
                unit: "rim",
                keterangan: "",
                stockBefore: 12,
                stockAfter: 8,
              },
            ],
          },
        ],
      }),
    );

    const response = await request({
      recipientName: "Gudang PT Teladan",
      quantities: {
        "item-paper": 3,
      },
      keterangan: {},
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("PENDING");
    expect(body.sequence).toBe(2);
    expect(productUpdateMock).not.toHaveBeenCalled();
    expect(transactionUpdateMock).not.toHaveBeenCalled();
    expect(inventoryLogCreateManyMock).not.toHaveBeenCalled();
  });
});

function makeTransaction(options: {
  stockManagedBySuratJalan?: boolean;
  existingSuratJalan: unknown[];
}) {
  return {
    id: "txn-1",
    invoiceNumber: "INV-20260614-0001",
    storeId: "store-main",
    status: "COMPLETED",
    stockManagedBySuratJalan: options.stockManagedBySuratJalan ?? false,
    customerName: "PT Teladan",
    createdAt: new Date("2026-06-14T03:00:00.000Z"),
    total: 150000,
    items: [
      {
        id: "item-paper",
        productId: "product-paper",
        printingServiceId: null,
        productName: "Kertas A4",
        quantity: 10,
        unitPrice: 10000,
        subtotal: 100000,
        product: { stock: 2, unit: "rim" },
      },
      {
        id: "item-pen",
        productId: "product-pen",
        printingServiceId: null,
        productName: "Pulpen",
        quantity: 5,
        unitPrice: 10000,
        subtotal: 50000,
        product: { stock: 8, unit: "pcs" },
      },
    ],
    suratJalan: options.existingSuratJalan,
  };
}

describe("GET /api/transactions/[id]/surat-jalan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T07:00:00.000Z"));
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      name: "Cashier",
      role: "CASHIER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        transaction: {
          findFirst: transactionFindFirstMock,
        },
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns progress, remaining items, and surat jalan records for the popup", async () => {
    const confirmed = {
      id: "sj-1",
      number: "TLD-14062026-001",
      status: "CONFIRMED",
      recipientName: "PT Teladan",
      sequence: 1,
      requestedByName: "Cashier",
      approvedByName: "Cashier",
      createdAt: new Date("2026-06-14T04:00:00.000Z"),
      confirmedAt: new Date("2026-06-14T04:00:00.000Z"),
      items: [
        {
          id: "sj-item-1",
          transactionItemId: "item-paper",
          productId: "product-paper",
          productName: "Kertas A4",
          quantity: 4,
          unit: "rim",
          keterangan: "",
          stockBefore: 12,
          stockAfter: 8,
        },
      ],
    };
    transactionFindFirstMock.mockResolvedValue(
      makeTransaction({
        stockManagedBySuratJalan: true,
        existingSuratJalan: [confirmed],
      }),
    );

    const { GET } = await import("../route");
    const response = await GET(
      new Request("http://localhost/api/transactions/txn-1/surat-jalan"),
      { params: Promise.resolve({ id: "txn-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.transaction).toEqual(
      expect.objectContaining({
        invoiceNumber: "INV-20260614-0001",
        customerName: "PT Teladan",
        createdAt: "2026-06-14T03:00:00.000Z",
        total: 150000,
      }),
    );
    expect(body.data.transaction.items[0]).toEqual(
      expect.objectContaining({
        productName: "Kertas A4",
        quantity: 10,
        unit: "rim",
        unitPrice: 10000,
        subtotal: 100000,
      }),
    );
    expect(body.data.progress).toEqual({
      totalQuantity: 15,
      deliveredQuantity: 4,
      pendingQuantity: 0,
      remainingQuantity: 11,
      status: "IN_PROGRESS",
    });
    expect(body.data.remainingItems).toEqual([
      expect.objectContaining({
        transactionItemId: "item-paper",
        remainingQuantity: 6,
      }),
      expect.objectContaining({
        transactionItemId: "item-pen",
        remainingQuantity: 5,
      }),
    ]);
    expect(body.data.suratJalan).toHaveLength(1);
    expect(body.data.suratJalan[0].number).toBe("TLD-14062026-001");
  });
});

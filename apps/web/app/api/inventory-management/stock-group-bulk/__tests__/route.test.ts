import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const productStockGroupFindManyMock = vi.hoisted(() => vi.fn());
const batchOperationCreateMock = vi.hoisted(() => vi.fn());
const batchOperationItemCreateMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findMany: productFindManyMock,
    },
    productStockGroup: {
      findMany: productStockGroupFindManyMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

function product(overrides: Record<string, unknown>) {
  return {
    id: "product-1",
    name: "Produk",
    sku: "SKU-1",
    barcode: null,
    description: null,
    price: 1000,
    costPrice: null,
    hargaDinas: null,
    hargaAgen: null,
    stock: 0,
    minStock: 1,
    unit: "pcs",
    size: null,
    material: null,
    categoryId: "cat-1",
    storeId: "store-main",
    isActive: true,
    imageUrl: null,
    stockGroupId: null,
    unitMultiplierToBase: 1,
    conversionNeedsReview: false,
    stockGroup: null,
    ...overrides,
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/inventory-management/stock-group-bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/inventory-management/stock-group-bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Rina",
      storeId: "store-main",
      role: "INVENTORY",
    });
    batchOperationCreateMock.mockResolvedValue({ id: "batch-1" });
    let logIndex = 0;
    inventoryLogCreateMock.mockImplementation(async ({ data }) => {
      logIndex += 1;
      return { id: `log-${logIndex}`, ...data };
    });
    batchOperationItemCreateMock.mockResolvedValue({ id: "item-1" });
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        batchOperation: { create: batchOperationCreateMock },
        batchOperationItem: { create: batchOperationItemCreateMock },
        inventoryLog: { create: inventoryLogCreateMock },
      }),
    );
  });

  it("creates bundled logs for Stok Bersama and standalone logs for Stok Produk Ini", async () => {
    const sheet = product({
      id: "sheet",
      name: "Kertas A4",
      sku: "A4-LBR",
      unit: "lembar",
      stock: 100,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      stockGroup: { id: "group-1", displayName: "Kertas A4", baseUnit: "lembar", baseStock: 100 },
    });
    const pack = product({
      id: "pack",
      name: "Kertas A4",
      sku: "A4-PACK",
      unit: "pack",
      stock: 10,
      stockGroupId: "group-1",
      unitMultiplierToBase: 10,
      stockGroup: { id: "group-1", displayName: "Kertas A4", baseUnit: "lembar", baseStock: 100 },
    });
    const marker = product({
      id: "marker",
      name: "Snowman G2",
      sku: "SM-G2",
      unit: "pcs",
      stock: 12,
    });

    productFindManyMock.mockResolvedValue([sheet, pack, marker]);
    productStockGroupFindManyMock.mockResolvedValue([
      {
        id: "group-1",
        displayName: "Kertas A4",
        baseUnit: "lembar",
        baseStock: 100,
        products: [sheet, pack],
      },
    ]);

    const { POST } = await import("../route");
    const response = await POST(
      request({
        action: "submit",
        rows: [
          { productId: "pack", mode: "GROUP_STOCK", type: "IN", inputValue: 2, note: "Tambah pack" },
          { productId: "marker", mode: "PRODUCT_ONLY", type: "OUT", inputValue: 3, note: "Dipakai display" },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.bundleBatchOperationId).toBe("batch-1");
    expect(body.data.standaloneLogIds).toEqual(["log-3"]);
    expect(batchOperationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "BULK_STOCK_GROUP_ADJUSTMENT",
          status: "PENDING",
          summary: expect.objectContaining({
            source: "PRODUCT_FIRST_STOCK_GROUP_BULK",
            totalCount: 2,
          }),
        }),
      }),
    );
    expect(inventoryLogCreateMock).toHaveBeenCalledTimes(3);
    expect(batchOperationItemCreateMock).toHaveBeenCalledTimes(2);
    expect(inventoryLogCreateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "marker",
          type: "OUT",
          quantity: 3,
          note: "Dipakai display\nMode: Stok Produk Ini - stok grup tidak diubah",
          status: "PENDING",
        }),
      }),
    );
  });

  it("rejects two Stok Bersama rows from the same stock group", async () => {
    const sheet = product({
      id: "sheet",
      name: "Kertas A4",
      sku: "A4-LBR",
      unit: "lembar",
      stock: 100,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      stockGroup: { id: "group-1", displayName: "Kertas A4", baseUnit: "lembar", baseStock: 100 },
    });
    const pack = product({
      id: "pack",
      name: "Kertas A4",
      sku: "A4-PACK",
      unit: "pack",
      stock: 10,
      stockGroupId: "group-1",
      unitMultiplierToBase: 10,
      stockGroup: { id: "group-1", displayName: "Kertas A4", baseUnit: "lembar", baseStock: 100 },
    });
    productFindManyMock.mockResolvedValue([sheet, pack]);
    productStockGroupFindManyMock.mockResolvedValue([
      {
        id: "group-1",
        displayName: "Kertas A4",
        baseUnit: "lembar",
        baseStock: 100,
        products: [sheet, pack],
      },
    ]);

    const { POST } = await import("../route");
    const response = await POST(
      request({
        action: "preview",
        rows: [
          { productId: "sheet", mode: "GROUP_STOCK", type: "OUT", inputValue: 2 },
          { productId: "pack", mode: "GROUP_STOCK", type: "OUT", inputValue: 1 },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toBe("Pilih satu produk saja per grup stok untuk mode Stok Bersama.");
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});

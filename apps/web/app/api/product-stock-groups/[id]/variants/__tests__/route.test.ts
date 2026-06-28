import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const productStockGroupFindFirstMock = vi.hoisted(() => vi.fn());
const productFindUniqueMock = vi.hoisted(() => vi.fn());
const productCreateMock = vi.hoisted(() => vi.fn());
const productPriceLogCreateManyMock = vi.hoisted(() => vi.fn());
const groupActivityCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
}));

describe("POST /api/product-stock-groups/[id]/variants", () => {
  let POST: typeof import("../route").POST;

  beforeAll(async () => {
    ({ POST } = await import("../route"));
  }, 15000);

  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      name: "Admin",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productStockGroupFindFirstMock.mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      displayName: "HVS A4",
      products: [
        {
          id: "rim",
          name: "HVS A4",
          sku: "HVS-A4-RIM",
          unit: "rim",
          categoryId: "cat-paper",
          material: "70gsm",
          size: "A4",
          unitMultiplierToBase: 1,
        },
      ],
    });
    productFindUniqueMock.mockResolvedValue(null);
    productCreateMock.mockResolvedValue({
      id: "dus",
      name: "HVS A4",
      sku: "HVS-A4-DUS",
      unit: "dus",
      price: 250000,
      costPrice: 200000,
      conversionNeedsReview: false,
    });
    productPriceLogCreateManyMock.mockResolvedValue({ count: 2 });
    groupActivityCreateMock.mockResolvedValue({});
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        productStockGroup: {
          findFirst: productStockGroupFindFirstMock,
        },
        product: {
          findUnique: productFindUniqueMock,
          create: productCreateMock,
        },
        productPriceLog: { createMany: productPriceLogCreateManyMock },
        productStockGroupActivity: { create: groupActivityCreateMock },
      }),
    );
  });

  it("creates a new unit variant with generated SKU and confirmed conversion", async () => {
    const response = await POST(
      new Request("http://localhost/api/product-stock-groups/group-1/variants", {
        method: "POST",
        body: JSON.stringify({
          unit: "dus",
          price: 250000,
          costPrice: 200000,
          stock: 4,
          minStock: 1,
          conversionPair: {
            fromQuantity: 1,
            toProductId: "rim",
            toQuantity: 5,
          },
          note: "Tambah dus",
        }),
      }),
      { params: Promise.resolve({ id: "group-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.sku).toBe("HVS-A4-DUS");
    expect(productCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "HVS A4",
          sku: "HVS-A4-DUS",
          unit: "dus",
          stockGroupId: "group-1",
          unitMultiplierToBase: 5,
          conversionNeedsReview: false,
        }),
      }),
    );
    expect(productPriceLogCreateManyMock).toHaveBeenCalled();
    expect(groupActivityCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stockGroupId: "group-1",
          type: "VARIANT_ADDED",
          productId: "dus",
        }),
      }),
    );
  }, 15000);

  it("rejects a new variant when the unit already exists in the group", async () => {
    const response = await POST(
      new Request("http://localhost/api/product-stock-groups/group-1/variants", {
        method: "POST",
        body: JSON.stringify({
          unit: "rim",
          price: 45000,
          costPrice: 38000,
          stock: 10,
          minStock: 2,
          conversionPair: null,
        }),
      }),
      { params: Promise.resolve({ id: "group-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.errors.unit).toContain("DUPLICATE_UNIT");
    expect(productCreateMock).not.toHaveBeenCalled();
    expect(groupActivityCreateMock).not.toHaveBeenCalled();
  }, 15000);
});

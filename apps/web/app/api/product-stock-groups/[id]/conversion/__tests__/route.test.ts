import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const groupRowLockMock = vi.hoisted(() => vi.fn());
const productStockGroupFindFirstMock = vi.hoisted(() => vi.fn());
const productStockGroupUpdateMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
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

describe("PATCH /api/product-stock-groups/[id]/conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productStockGroupFindFirstMock.mockReset();
    groupRowLockMock.mockReset();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    groupRowLockMock.mockResolvedValue([{ id: "group-1" }]);
    productStockGroupFindFirstMock.mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      displayName: "Kertas A4",
      baseUnit: "rim",
      baseStock: 20,
      products: [
        {
          id: "rim",
          stockGroupId: "group-1",
          unit: "rim",
          unitMultiplierToBase: 1,
          conversionNeedsReview: false,
        },
        {
          id: "dus",
          stockGroupId: "group-1",
          unit: "dus",
          unitMultiplierToBase: 5,
          conversionNeedsReview: false,
        },
      ],
    });
    productStockGroupUpdateMock.mockResolvedValue({
      id: "group-1",
      baseUnit: "rim",
      baseStock: 20,
    });
    productUpdateMock.mockResolvedValue({});
    groupActivityCreateMock.mockResolvedValue({});
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: groupRowLockMock,
        productStockGroup: {
          findFirst: productStockGroupFindFirstMock,
          update: productStockGroupUpdateMock,
        },
        product: { update: productUpdateMock },
        productStockGroupActivity: { create: groupActivityCreateMock },
      }),
    );
  });

  it("updates conversion multipliers atomically and writes conversion history", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request("http://localhost/api/product-stock-groups/group-1/conversion", {
        method: "PATCH",
        body: JSON.stringify({
          mode: "KEEP_SHARED_STOCK",
          conversionPairs: [
            {
              fromProductId: "dus",
              fromQuantity: 1,
              toProductId: "rim",
              toQuantity: 4,
            },
          ],
          note: "Dus supplier berubah",
        }),
      }),
      { params: Promise.resolve({ id: "group-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.baseStock).toBe(20);
    expect(productStockGroupUpdateMock).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: {
        baseUnit: "rim",
        baseStock: 20,
      },
    });
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "dus" },
      data: {
        unitMultiplierToBase: 4,
        conversionNeedsReview: false,
      },
    });
    expect(groupActivityCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stockGroupId: "group-1",
          type: "CONVERSION_RATE_CHANGED",
          note: "Dus supplier berubah",
        }),
      }),
    );
  });

  it("rejects conversion pairs that use the same source and target product", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request("http://localhost/api/product-stock-groups/group-1/conversion", {
        method: "PATCH",
        body: JSON.stringify({
          mode: "KEEP_SHARED_STOCK",
          conversionPairs: [
            {
              fromProductId: "rim",
              fromQuantity: 1,
              toProductId: "rim",
              toQuantity: 1,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "group-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.errors.conversionPairs).toContain("INVALID_CONVERSION_PAIR");
    expect(productStockGroupUpdateMock).not.toHaveBeenCalled();
    expect(productUpdateMock).not.toHaveBeenCalled();
    expect(groupActivityCreateMock).not.toHaveBeenCalled();
  });

  it("locks the group and products before the authoritative stock reload", async () => {
    let currentBaseStock = 20;
    const order: string[] = [];
    const groupState = () => ({
      id: "group-1",
      storeId: "store-main",
      displayName: "Kertas A4",
      baseUnit: "rim",
      baseStock: currentBaseStock,
      products: [
        {
          id: "rim",
          stockGroupId: "group-1",
          unit: "rim",
          unitMultiplierToBase: 1,
          conversionNeedsReview: false,
        },
        {
          id: "dus",
          stockGroupId: "group-1",
          unit: "dus",
          unitMultiplierToBase: 5,
          conversionNeedsReview: false,
        },
      ],
    });
    productStockGroupFindFirstMock
      .mockImplementationOnce(async () => {
        order.push("hint");
        return groupState();
      })
      .mockImplementationOnce(async () => {
        order.push("read");
        return groupState();
      });
    groupRowLockMock.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        const table = strings.join(" ").includes("pos_product_stock_groups")
          ? "group"
          : "product";
        order.push(`${table}:${rowId}`);
        if (table === "group") currentBaseStock = 44;
        return [{ id: rowId }];
      },
    );

    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request(
        "http://localhost/api/product-stock-groups/group-1/conversion",
        {
          method: "PATCH",
          body: JSON.stringify({
            mode: "PRESERVE_SOURCE_STOCK",
            sourceProductId: "rim",
            conversionPairs: [
              {
                fromProductId: "dus",
                fromQuantity: 1,
                toProductId: "rim",
                toQuantity: 4,
              },
            ],
          }),
        },
      ),
      { params: Promise.resolve({ id: "group-1" }) },
    );

    expect(response.status).toBe(200);
    expect(order).toEqual([
      "hint",
      "group:group-1",
      "product:dus",
      "product:rim",
      "read",
    ]);
    expect(productStockGroupUpdateMock).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: {
        baseUnit: "rim",
        baseStock: 44,
      },
    });
  });

  it("returns conflict when active group membership changes before reload", async () => {
    const hint = {
      id: "group-1",
      storeId: "store-main",
      displayName: "Kertas A4",
      baseUnit: "rim",
      baseStock: 20,
      products: [
        {
          id: "rim",
          stockGroupId: "group-1",
          unit: "rim",
          unitMultiplierToBase: 1,
          conversionNeedsReview: false,
        },
        {
          id: "dus",
          stockGroupId: "group-1",
          unit: "dus",
          unitMultiplierToBase: 5,
          conversionNeedsReview: false,
        },
      ],
    };
    productStockGroupFindFirstMock
      .mockResolvedValueOnce(hint)
      .mockResolvedValueOnce({
        ...hint,
        products: hint.products.slice(0, 1),
      });

    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request(
        "http://localhost/api/product-stock-groups/group-1/conversion",
        {
          method: "PATCH",
          body: JSON.stringify({
            mode: "KEEP_SHARED_STOCK",
            conversionPairs: [
              {
                fromProductId: "dus",
                fromQuantity: 1,
                toProductId: "rim",
                toQuantity: 4,
              },
            ],
          }),
        },
      ),
      { params: Promise.resolve({ id: "group-1" }) },
    );

    expect(response.status).toBe(409);
    expect(productStockGroupUpdateMock).not.toHaveBeenCalled();
    expect(productUpdateMock).not.toHaveBeenCalled();
  });
});

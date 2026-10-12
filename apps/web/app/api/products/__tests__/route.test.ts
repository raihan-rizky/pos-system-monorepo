import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindUniqueMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const productCountMock = vi.hoisted(() => vi.fn());
const productStockGroupFindManyMock = vi.hoisted(() => vi.fn());
const brandFindFirstMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const groupRowLockMock = vi.hoisted(() => vi.fn());
const productCreateMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const productDeleteMock = vi.hoisted(() => vi.fn());
const transactionItemCountMock = vi.hoisted(() => vi.fn());
const productPriceLogCreateManyMock = vi.hoisted(() => vi.fn());
const txProductStockGroupFindUniqueMock = vi.hoisted(() => vi.fn());
const txProductStockGroupCreateMock = vi.hoisted(() => vi.fn());
const groupActivityCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findUnique: productFindUniqueMock,
      findFirst: productFindFirstMock,
      findMany: productFindManyMock,
      count: productCountMock,
      create: productCreateMock,
      update: productUpdateMock,
      delete: productDeleteMock,
    },
    productStockGroup: {
      findMany: productStockGroupFindManyMock,
    },
    brand: {
      findFirst: brandFindFirstMock,
    },
    productPriceLog: {
      createMany: productPriceLogCreateManyMock,
    },
    transactionItem: {
      count: transactionItemCountMock,
    },
    $transaction: transactionMock,
  },
  Prisma: {},
}));

describe("POST /api/products", () => {
  const originalUnitInput = {
    name: "Kertas", sku: "KERTAS-PCS", categoryId: "cat-1", unit: "pcs",
    stock: 24, minStock: 5, price: 2000, description: "Kertas putih",
  };
  const boxInput = { unit: "dus", sku: "KERTAS-DUS", relativeQuantity: 12, price: 22000 };

  it.each([
    { unit: "pcs", stock: 24, variant: boxInput, baseUnit: "pcs", primaryMultiplier: 1, addedMultiplier: 12 },
    { unit: "dus", stock: 2, variant: { ...boxInput, unit: "pcs", sku: "KERTAS-ECER", relativeQuantity: 1 / 12, price: 2000 }, baseUnit: "pcs", primaryMultiplier: 12, addedMultiplier: 1 },
  ])("creates optional units with shared stock when starting in $unit", async (example) => {
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, unit: example.unit, stock: example.stock, additionalUnitVariants: [example.variant] }),
    }));
    expect(response.status).toBe(201);
    expect(productCreateMock).toHaveBeenCalledTimes(2);
    expect(txProductStockGroupCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ baseUnit: example.baseUnit, baseStock: 24 }),
    }));
    expect(productCreateMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ stockGroupId: "group-created", unitMultiplierToBase: example.primaryMultiplier }),
    }));
    expect(productCreateMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ stockGroupId: "group-created", unitMultiplierToBase: example.addedMultiplier, price: example.variant.price, description: "Kertas putih" }),
    }));
  });

  it("creates several additional units without adding their equivalent stock twice", async () => {
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, additionalUnitVariants: [boxInput, { unit: "pak", sku: "KERTAS-PAK", relativeQuantity: 6, price: 11000 }] }),
    }));
    expect(response.status).toBe(201);
    expect(productCreateMock).toHaveBeenCalledTimes(3);
    expect(txProductStockGroupCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ baseStock: 24 }) }));
  });

  it.each([
    { ...boxInput, unit: " PCS " },
    { ...boxInput, sku: "KERTAS-PCS" },
    { ...boxInput, relativeQuantity: 0 },
    { ...boxInput, price: -1 },
  ])("rejects invalid additional unit data before starting a transaction", async (variant) => {
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, additionalUnitVariants: [variant] }),
    }));
    expect(response.status).toBe(422);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects combining new additional units and the legacy paired input", async () => {
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, additionalUnitVariants: [boxInput], smallestUnitVariant: { unit: "lembar", sku: "KERTAS-LBR", price: 100, multiplierFromPackaging: 10 } }),
    }));
    expect(response.status).toBe(422);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects mixing an empty additional-unit array with the legacy paired input", async () => {
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, additionalUnitVariants: [], smallestUnitVariant: { unit: "lembar", sku: "KERTAS-LBR", price: 100, multiplierFromPackaging: 10 } }),
    }));
    expect(response.status).toBe(422);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("omits request-only unit data from a single-product database write", async () => {
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, additionalUnitVariants: [] }),
    }));
    expect(response.status).toBe(201);
    expect(productCreateMock.mock.calls[0][0].data).not.toHaveProperty("additionalUnitVariants");
  });

  it("fails the transaction if a later additional-unit creation fails", async () => {
    productCreateMock.mockResolvedValueOnce({ id: "original", ...originalUnitInput })
      .mockRejectedValueOnce(new Error("variant write failed"));
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, additionalUnitVariants: [boxInput] }),
    }));
    expect(response.status).toBe(500);
    expect(productPriceLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("rejects an additional SKU already in the database before writing", async () => {
    productFindUniqueMock.mockImplementation(async ({ where }) => where.sku === boxInput.sku ? { id: "existing" } : null);
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, additionalUnitVariants: [boxInput] }),
    }));
    expect(response.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a matching existing group without creating another stock balance", async () => {
    txProductStockGroupFindUniqueMock.mockResolvedValue({ id: "existing-group" });
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, additionalUnitVariants: [boxInput] }),
    }));
    expect(response.status).toBe(409);
    expect(txProductStockGroupCreateMock).not.toHaveBeenCalled();
    expect(productCreateMock).not.toHaveBeenCalled();
  });

  it("returns a conflict when a unique constraint races the SKU precheck", async () => {
    productCreateMock.mockRejectedValueOnce({ code: "P2002" });
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, additionalUnitVariants: [boxInput] }),
    }));
    expect(response.status).toBe(409);
    expect(productPriceLogCreateManyMock).not.toHaveBeenCalled();
  });

  it.each(["variant", "price-log", "activity"])("leaves no committed products or balance when the %s write fails", async (failure) => {
    const committed: unknown[] = [];
    let stagedWrites = 0;
    transactionMock.mockImplementation(async (callback) => {
      const pending: unknown[] = [];
      let productCount = 0;
      const result = await callback({
        productStockGroup: {
          findUnique: async () => null,
          create: async ({ data }: { data: unknown }) => { pending.push(data); stagedWrites++; return { id: "new-group" }; },
        },
        product: { create: async ({ data }: { data: Record<string, unknown> }) => {
          productCount++;
          if (failure === "variant" && productCount === 2) throw new Error("variant failed");
          pending.push(data); stagedWrites++;
          return { ...data, id: `unit-${productCount}` };
        } },
        productPriceLog: { createMany: async ({ data }: { data: unknown }) => {
          if (failure === "price-log") throw new Error("price log failed");
          pending.push(data); stagedWrites++; return { count: 2 };
        } },
        productStockGroupActivity: { create: async () => { throw new Error("activity failed"); } },
      });
      committed.push(...pending);
      return result;
    });
    const response = await POST(new Request("http://localhost/api/products", {
      method: "POST", body: JSON.stringify({ ...originalUnitInput, additionalUnitVariants: [boxInput] }),
    }));
    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(stagedWrites).toBeGreaterThan(0);
    expect(committed).toEqual([]);
    expect(productCreateMock).not.toHaveBeenCalled();
    expect(productPriceLogCreateManyMock).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner User",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productFindUniqueMock.mockResolvedValue(null);
    brandFindFirstMock.mockResolvedValue(null);
    groupRowLockMock.mockImplementation(
      async (_strings: TemplateStringsArray, rowId: string) => [{ id: rowId }],
    );
    txProductStockGroupFindUniqueMock.mockReset();
    txProductStockGroupFindUniqueMock.mockResolvedValue(null);
    txProductStockGroupCreateMock.mockReset();
    txProductStockGroupCreateMock.mockResolvedValue({
      id: "group-created",
      storeId: "store-main",
      groupKey: "banner flexi|cat-1||",
      displayName: "Banner Flexi",
      baseUnit: "meter",
      baseStock: 0,
    });
    productCreateMock.mockReset().mockResolvedValue({
      id: "product-1",
      name: "Banner Flexi",
      sku: "BNR-FLX",
      price: 15000,
      costPrice: 9000,
      storeId: "store-main",
      category: { id: "cat-1", name: "Jasa Cetak", icon: null, color: null },
    });
    productPriceLogCreateManyMock.mockResolvedValue({ count: 2 });
    transactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: groupRowLockMock,
        product: { create: productCreateMock },
        productStockGroup: {
          findUnique: txProductStockGroupFindUniqueMock,
          create: txProductStockGroupCreateMock,
        },
        productPriceLog: { createMany: productPriceLogCreateManyMock },
      }),
    );
  });

  it("writes baseline price and HPP logs when creating a product", async () => {
    const response = await POST(
      new Request("http://localhost/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Banner Flexi",
          sku: "BNR-FLX",
          categoryId: "cat-1",
          price: 15000,
          costPrice: 9000,
          stock: 0,
          unit: "meter",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(productPriceLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productId: "product-1",
          storeId: "store-main",
          field: "PRICE",
          oldValue: null,
          newValue: "15000.00",
          source: "MANUAL",
          changedBy: "user-1",
          changedByName: "Owner User",
        }),
        expect.objectContaining({
          productId: "product-1",
          storeId: "store-main",
          field: "COST_PRICE",
          oldValue: null,
          newValue: "9000.00",
          source: "MANUAL",
        }),
      ],
    });
  });

  it("creates packaging and smallest sellable unit variants in one stock group", async () => {
    productFindUniqueMock.mockResolvedValue(null);
    txProductStockGroupFindUniqueMock.mockResolvedValue(null);
    txProductStockGroupCreateMock.mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      groupKey: "acco plastik joyko|cat-1||",
      displayName: "Acco Plastik Joyko",
      baseUnit: "pcs",
      baseStock: 48,
    });
    productCreateMock
      .mockResolvedValueOnce({
        id: "product-dus",
        name: "Acco Plastik Joyko",
        sku: "ACCO-DUS",
        price: 50000,
        costPrice: 35000,
        stock: 0.96,
        unit: "Dus",
        unitMultiplierToBase: 50,
        category: { id: "cat-1", name: "ATK", icon: null, color: null },
        stockGroup: {
          id: "group-1",
          groupKey: "acco plastik joyko|cat-1||",
          displayName: "Acco Plastik Joyko",
          baseUnit: "pcs",
          baseStock: 48,
        },
      })
      .mockResolvedValueOnce({
        id: "product-pcs",
        name: "Acco Plastik Joyko",
        sku: "ACCO-PCS",
        price: 1200,
        costPrice: 700,
        stock: 48,
        unit: "pcs",
        unitMultiplierToBase: 1,
      });
    transactionMock.mockImplementation((callback) =>
      callback({
        product: { create: productCreateMock },
        productStockGroup: {
          findUnique: txProductStockGroupFindUniqueMock,
          create: txProductStockGroupCreateMock,
        },
        productPriceLog: { createMany: productPriceLogCreateManyMock },
        productStockGroupActivity: { create: groupActivityCreateMock },
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Acco Plastik Joyko",
          sku: "ACCO-DUS",
          categoryId: "cat-1",
          price: 50000,
          costPrice: 35000,
          stock: 0.96,
          unit: "Dus",
          unitMultiplierToBase: 50,
          smallestUnitVariant: {
            unit: "pcs",
            sku: "ACCO-PCS",
            price: 1200,
            costPrice: 700,
            multiplierFromPackaging: 50,
          },
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(txProductStockGroupCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          baseUnit: "pcs",
          baseStock: 48,
        }),
      }),
    );
    expect(productCreateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          sku: "ACCO-DUS",
          unit: "Dus",
          unitMultiplierToBase: 50,
          stockGroupId: "group-1",
        }),
      }),
    );
    expect(productCreateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          sku: "ACCO-PCS",
          unit: "pcs",
          stock: 48,
          unitMultiplierToBase: 1,
          stockGroupId: "group-1",
        }),
      }),
    );
  });

  it("persists optional brand assignment when creating a product", async () => {
    brandFindFirstMock.mockResolvedValue({ id: "brand-joyko" });
    productCreateMock.mockResolvedValue({
      id: "product-1",
      name: "Pulpen Joyko",
      sku: "JOYKO-PEN",
      price: 5000,
      costPrice: 3000,
      brandId: "brand-joyko",
      storeId: "store-main",
      category: { id: "cat-1", name: "ATK", icon: null, color: null },
      brand: { id: "brand-joyko", name: "Joyko", normalizedName: "joyko" },
    });

    const response = await POST(
      new Request("http://localhost/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Pulpen Joyko",
          sku: "JOYKO-PEN",
          categoryId: "cat-1",
          brandId: "brand-joyko",
          price: 5000,
          costPrice: 3000,
          stock: 10,
          unit: "pcs",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(productCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandId: "brand-joyko",
        }),
      }),
    );
  });

  it("rejects brand assignment from another store when creating a product", async () => {
    brandFindFirstMock.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Pulpen Joyko",
          sku: "JOYKO-PEN",
          categoryId: "cat-1",
          brandId: "brand-other-store",
          price: 5000,
          stock: 10,
          unit: "pcs",
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(brandFindFirstMock).toHaveBeenCalledWith({
      where: { id: "brand-other-store", storeId: "store-main" },
      select: { id: true },
    });
    expect(productCreateMock).not.toHaveBeenCalled();
  });

  it("locks an existing target group and its products before reloading it", async () => {
    const order: string[] = [];
    const targetGroup = {
      id: "group-1",
      storeId: "store-main",
      groupKey: "banner flexi|cat-1||",
      displayName: "Banner Flexi",
      baseUnit: "meter",
      baseStock: 12,
      products: [
        {
          id: "existing-meter",
          stockGroupId: "group-1",
        },
      ],
    };
    txProductStockGroupFindUniqueMock
      .mockImplementationOnce(async () => {
        order.push("hint");
        return targetGroup;
      })
      .mockImplementationOnce(async () => {
        order.push("read");
        return targetGroup;
      });
    groupRowLockMock.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );
    productCreateMock.mockImplementationOnce(async () => {
      order.push("create");
      return {
        id: "product-1",
        name: "Banner Flexi",
        sku: "BNR-FLX",
        price: 15000,
        costPrice: 9000,
        storeId: "store-main",
        stockGroup: targetGroup,
      };
    });

    const response = await POST(
      new Request("http://localhost/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Banner Flexi",
          sku: "BNR-FLX",
          categoryId: "cat-1",
          price: 15000,
          costPrice: 9000,
          stock: 0,
          unit: "meter",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(order).toEqual([
      "hint",
      "group:group-1",
      "product:existing-meter",
      "read",
      "create",
    ]);
  });

  it("returns conflict when target-group membership changes before reload", async () => {
    const targetGroup = {
      id: "group-1",
      storeId: "store-main",
      groupKey: "banner flexi|cat-1||",
      displayName: "Banner Flexi",
      baseUnit: "meter",
      baseStock: 12,
      products: [
        {
          id: "existing-meter",
          stockGroupId: "group-1",
        },
      ],
    };
    txProductStockGroupFindUniqueMock
      .mockResolvedValueOnce(targetGroup)
      .mockResolvedValueOnce({ ...targetGroup, products: [] });

    const response = await POST(
      new Request("http://localhost/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Banner Flexi",
          sku: "BNR-FLX",
          categoryId: "cat-1",
          price: 15000,
          costPrice: 9000,
          stock: 0,
          unit: "meter",
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(productCreateMock).not.toHaveBeenCalled();
    expect(productPriceLogCreateManyMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/products", () => {
  it("applies a unit filter to both rows and counts before pagination", async () => {
    const response = await GET(new Request("http://localhost/api/products?unit=dus&categoryId=cat-1&page=2&limit=10"));
    expect(response.status).toBe(200);
    const expectedWhere = expect.objectContaining({
      storeId: "store-main", isActive: true, categoryId: "cat-1",
      unit: { equals: "dus", mode: "insensitive" },
    });
    expect(productFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere, skip: 10, take: 10 }));
    expect(productCountMock).toHaveBeenCalledWith({ where: expectedWhere });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner User",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productStockGroupFindManyMock.mockResolvedValue([
      { id: "group-1", _count: { products: 2 } },
    ]);
    productFindManyMock.mockResolvedValue([
      {
        id: "product-1",
        name: "Kertas A4",
        sku: "A4-RIM",
        price: 50000,
        costPrice: null,
        stock: 2,
        minStock: 1,
        unit: "rim",
        size: "A4",
        material: "70gsm",
        category: { id: "cat-1", name: "Kertas", icon: null, color: null },
        stockGroup: {
          id: "group-1",
          groupKey: "kertas|cat|70gsm|a4",
          displayName: "Kertas A4",
          baseUnit: "lembar",
          baseStock: 1000,
        },
        unitMultiplierToBase: 500,
      },
    ]);
    productCountMock.mockResolvedValue(1);
  });

  it("includes the base-unit modal even when the base product is outside this page", async () => {
    const rim = { id: "rim", storeId: "store-main", name: "Kertas A4", price: 50000, costPrice: 9000, unit: "rim", stock: 10, stockGroupId: "paper", category: { id: "cat-paper", name: "Kertas" }, stockGroup: { id: "paper", baseUnit: "pcs", baseStock: 5000 } };
    productFindManyMock.mockImplementation(async (args: any) => args.where.OR ? [{ ...rim }, { ...rim, id: "pcs", unit: "pcs", costPrice: 700 }] : [rim]);
    const response = await GET(new Request("http://localhost/api/products?limit=1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0]).toMatchObject({ baseCostPrice: 700, baseCostUnit: "pcs", costPrice: 9000 });
    expect(body.data[0].variants[0].baseCostPrice).toBe(700);
  });

  it("filters products to groups with at least the requested variant count", async () => {
    const response = await GET(
      new Request("http://localhost/api/products?stockGroupMinVariants=2"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(productStockGroupFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-main" }),
      }),
    );
    expect(productFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stockGroupId: { in: ["group-1"] },
        }),
      }),
    );
    expect(body.data[0].stock).toBe(2);
  });

  it("groups products by name and category", async () => {
    productFindManyMock.mockResolvedValue([
      {
        id: "p1",
        name: "Coffee",
        sku: "COFFEE-DUS",
        price: 50000,
        stock: 10,
        unit: "dus",
        isActive: true,
        category: { id: "cat1", name: "Beverage", icon: null, color: "#000" },
      },
      {
        id: "p2",
        name: "Coffee",
        sku: "COFFEE-PCS",
        price: 5000,
        stock: 100,
        unit: "pcs",
        isActive: true,
        category: { id: "cat1", name: "Beverage", icon: null, color: "#000" },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/products"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].variants).toHaveLength(2);
    expect(body.data[0].defaultVariant.stock).toBe(100);
  });

  it("searches products by category and brand names", async () => {
    productFindManyMock.mockResolvedValue([
      {
        id: "p-kertas-a4",
        name: "A4 70gsm",
        sku: "A4-70-RIM",
        price: 50000,
        stock: 10,
        unit: "rim",
        isActive: true,
        category: { id: "cat-paper", name: "Kertas", icon: null, color: "#000" },
        brand: { id: "brand-paperline", name: "Paperline", normalizedName: "paperline" },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/products?search=kertas"),
    );

    expect(response.status).toBe(200);
    expect(productFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            expect.objectContaining({
              OR: expect.arrayContaining([
                {
                  category: {
                    is: {
                      name: { contains: "kertas", mode: "insensitive" },
                    },
                  },
                },
                {
                  brand: {
                    is: {
                      name: { contains: "kertas", mode: "insensitive" },
                    },
                  },
                },
              ]),
            }),
          ],
        }),
      }),
    );
  });
});

describe("DELETE /api/products", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner User",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productFindFirstMock.mockImplementation(
      async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        stockGroupId: null,
        isActive: true,
      }),
    );
    productUpdateMock.mockResolvedValue({ id: "product-1" });
    productDeleteMock.mockResolvedValue({ id: "product-1" });
    groupRowLockMock.mockImplementation(
      async (_strings: TemplateStringsArray, rowId: string) => [{ id: rowId }],
    );
    transactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: groupRowLockMock,
        product: {
          findFirst: productFindFirstMock,
          findMany: productFindManyMock,
          update: productUpdateMock,
          delete: productDeleteMock,
        },
        transactionItem: {
          count: transactionItemCountMock,
        },
      }),
    );
  });

  it("hard-deletes products with no transactions and soft-deletes products with transactions", async () => {
    productFindManyMock.mockResolvedValue([{ id: "product-1" }, { id: "product-2" }]);
    // product-1 never sold -> hard delete; product-2 sold -> soft delete
    transactionItemCountMock
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);

    const response = await DELETE(
      new Request("http://localhost/api/products?ids=product-1,product-2", {
        method: "DELETE",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(productDeleteMock).toHaveBeenCalledWith({ where: { id: "product-1" } });
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "product-2" },
      data: { isActive: false },
    });
    expect(body.summary).toEqual({
      total: 2,
      hardDeleted: 1,
      softDeleted: 1,
      failed: 0,
    });
    expect(body.results).toEqual([
      { id: "product-1", status: "hard_deleted" },
      { id: "product-2", status: "soft_deleted" },
    ]);
  });

  it("rejects when no ids provided", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/products", { method: "DELETE" }),
    );
    expect(response.status).toBe(422);
  });

  it("rejects when some products do not belong to the store", async () => {
    productFindManyMock.mockResolvedValue([{ id: "product-1" }]);

    const response = await DELETE(
      new Request("http://localhost/api/products?ids=product-1,product-2", {
        method: "DELETE",
      }),
    );
    expect(response.status).toBe(404);
    expect(productDeleteMock).not.toHaveBeenCalled();
  });

  it("reports partial failures with 207 status (fail-soft)", async () => {
    productFindManyMock.mockResolvedValue([{ id: "product-1" }, { id: "product-2" }]);
    transactionItemCountMock.mockResolvedValue(0);
    productDeleteMock
      .mockResolvedValueOnce({ id: "product-1" })
      .mockRejectedValueOnce(new Error("FK constraint"));

    const response = await DELETE(
      new Request("http://localhost/api/products?ids=product-1,product-2", {
        method: "DELETE",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(body.summary.failed).toBe(1);
    expect(body.summary.hardDeleted).toBe(1);
    expect(body.results).toEqual([
      { id: "product-1", status: "hard_deleted" },
      { id: "product-2", status: "error", message: "FK constraint" },
    ]);
  });

  it("rolls back only the failed item transaction and continues in original order", async () => {
    const products = [
      {
        id: "product-fail",
        stockGroupId: "group-z",
        isActive: true,
      },
      {
        id: "product-ok",
        stockGroupId: "group-a",
        isActive: true,
      },
    ];
    const events: string[] = [];
    let transactionNumber = 0;
    productFindManyMock.mockResolvedValue(products);
    transactionMock.mockImplementation(async (callback) => {
      transactionNumber += 1;
      const txName = `tx${transactionNumber}`;
      let poisoned = false;
      const readCountByProduct = new Map<string, number>();
      events.push(`${txName}:begin`);

      try {
        const result = await callback({
          $queryRaw: async (
            strings: TemplateStringsArray,
            rowId: string,
          ) => {
            const kind = strings
              .join(" ")
              .includes("pos_product_stock_groups")
              ? "group"
              : "product";
            events.push(`${txName}:lock:${kind}:${rowId}`);
            return [{ id: rowId }];
          },
          product: {
            findMany: productFindManyMock,
            findFirst: async ({
              where,
            }: {
              where: { id: string };
            }) => {
              const reads = readCountByProduct.get(where.id) ?? 0;
              readCountByProduct.set(where.id, reads + 1);
              events.push(
                `${txName}:${reads === 0 ? "hint" : "reload"}:${where.id}`,
              );
              return products.find((product) => product.id === where.id);
            },
            update: productUpdateMock,
            delete: async ({ where }: { where: { id: string } }) => {
              events.push(`${txName}:delete:${where.id}`);
              if (where.id === "product-fail") {
                poisoned = true;
                throw new Error("FK constraint");
              }
              if (poisoned) {
                throw new Error("current transaction is aborted");
              }
              return { id: where.id };
            },
          },
          transactionItem: {
            count: async () => {
              if (poisoned) {
                throw new Error("current transaction is aborted");
              }
              return 0;
            },
          },
        });
        if (poisoned) {
          throw new Error("current transaction is aborted");
        }
        events.push(`${txName}:commit`);
        return result;
      } catch (error) {
        events.push(`${txName}:rollback`);
        throw error;
      }
    });

    const response = await DELETE(
      new Request(
        "http://localhost/api/products?ids=product-fail,product-ok",
        { method: "DELETE" },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(body.results).toEqual([
      {
        id: "product-fail",
        status: "error",
        message: "FK constraint",
      },
      { id: "product-ok", status: "hard_deleted" },
    ]);
    expect(events).toEqual([
      "tx1:begin",
      "tx1:hint:product-fail",
      "tx1:lock:group:group-z",
      "tx1:lock:product:product-fail",
      "tx1:reload:product-fail",
      "tx1:delete:product-fail",
      "tx1:rollback",
      "tx2:begin",
      "tx2:hint:product-ok",
      "tx2:lock:group:group-a",
      "tx2:lock:product:product-ok",
      "tx2:reload:product-ok",
      "tx2:delete:product-ok",
      "tx2:commit",
    ]);
  });

  it("locks and reloads each mixed-group product inside its item transaction", async () => {
    const order: string[] = [];
    const products = [
      { id: "product-z", stockGroupId: "group-z", isActive: true },
      { id: "product-a", stockGroupId: "group-a", isActive: true },
    ];
    const readsByProduct = new Map<string, number>();
    productFindManyMock.mockImplementation(async () => {
      order.push("validate-products");
      return products;
    });
    productFindFirstMock.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        const reads = readsByProduct.get(where.id) ?? 0;
        readsByProduct.set(where.id, reads + 1);
        order.push(`${reads === 0 ? "hint" : "reload"}:${where.id}`);
        return products.find((product) => product.id === where.id);
      },
    );
    groupRowLockMock.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );
    transactionItemCountMock.mockImplementation(
      async ({ where }: { where: { productId: string } }) => {
        order.push(`count:${where.productId}`);
        return where.productId === "product-z" ? 1 : 0;
      },
    );
    productUpdateMock.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        order.push(`soft:${where.id}`);
        return { id: where.id };
      },
    );
    productDeleteMock.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        order.push(`hard:${where.id}`);
        return { id: where.id };
      },
    );

    const response = await DELETE(
      new Request(
        "http://localhost/api/products?ids=product-z,product-a",
        { method: "DELETE" },
      ),
    );

    expect(response.status).toBe(200);
    expect(order).toEqual([
      "validate-products",
      "hint:product-z",
      "group:group-z",
      "product:product-z",
      "reload:product-z",
      "count:product-z",
      "soft:product-z",
      "hint:product-a",
      "group:group-a",
      "product:product-a",
      "reload:product-a",
      "count:product-a",
      "hard:product-a",
    ]);
  });
});

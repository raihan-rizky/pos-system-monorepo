import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

const txMock = {
  product: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  supplier: {
    findMany: vi.fn(),
  },
  productSupplier: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  category: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  batchOperation: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  batchOperationItem: {
    create: vi.fn(),
    createMany: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  productImportPlannedRow: {
    count: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  productPriceLog: {
    createMany: vi.fn(),
  },
  productStockGroup: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    createMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  inventoryLog: {
    create: vi.fn(),
    createMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
};

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
  Prisma: {
    InputJsonValue: {},
  },
}));

describe("POST /api/products/import/commit/chunk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner",
      storeId: "store-main",
    });
    dbTransactionMock.mockImplementation((callback) => callback(txMock));
    txMock.product.findMany.mockResolvedValue([]);
    txMock.supplier.findMany.mockResolvedValue([]);
    txMock.productSupplier.createMany.mockResolvedValue({ count: 0 });
    txMock.productSupplier.deleteMany.mockResolvedValue({ count: 0 });
    txMock.category.findMany.mockResolvedValue([{ id: "cat-1", name: "Jasa" }]);
    txMock.batchOperation.findFirst.mockResolvedValue({
      id: "batch-1",
      type: "PRODUCT_IMPORT",
      status: "PENDING",
      storeId: "store-main",
      summary: {
        rowCount: 1,
        chunkSize: 75,
        createdProductCount: 1,
        variantProductCount: 0,
        updatedProductCount: 0,
        skippedRowCount: 0,
        conversionReviewCount: 0,
        createdCategoryCount: 0,
        inventoryLogCount: 1,
        priceLogCount: 1,
      },
    });
    txMock.product.findMany.mockResolvedValue([]);
    txMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        batchOperationId: "batch-1",
        sourceRowNumber: 2,
        cursorIndex: 0,
        status: "COMMITTED",
        sku: "AMP-001",
        productId: null,
        commitAction: "create",
        rowData: {
          rowNumber: 2,
          name: "Amplop",
          sku: "AMP-001",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pack",
          costPrice: 800,
          duplicateInFile: false,
          missingCategory: false,
          warnings: [],
          errors: [],
          autoAction: "create",
        },
      },
    ]);
    txMock.productImportPlannedRow.count.mockImplementation(async ({ where }) => {
      if (where.status?.not) return 0;
      return 1;
    });
    txMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 0 });
    txMock.batchOperationItem.findMany.mockResolvedValue([{ sourceRowNumber: 2 }]);
    txMock.batchOperationItem.createMany.mockResolvedValue({ count: 0 });
    txMock.batchOperationItem.count.mockResolvedValue(1);
    txMock.productStockGroup.findMany.mockResolvedValue([]);
    txMock.productStockGroup.createMany.mockResolvedValue({ count: 0 });
  });

  it("does not mutate products again when a retried chunk row is already committed", async () => {
    const response = await POST(
      new Request("http://localhost/api/products/import/commit/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchOperationId: "batch-1",
          cursor: 0,
          chunkSize: 75,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.done).toBe(true);
    expect(body.committedRowCount).toBe(1);
    expect(txMock.product.create).not.toHaveBeenCalled();
    expect(txMock.product.update).not.toHaveBeenCalled();
    expect(txMock.batchOperationItem.create).not.toHaveBeenCalled();
  });

  it("processes auto price updates without touching stock groups", async () => {
    const existingProduct = {
      id: "prod-1",
      name: "Cetakan R3-05",
      sku: "Cetakan R3-05",
      barcode: null,
      description: null,
      price: 1000,
      costPrice: 700,
      hargaDinas: null,
      stock: 10,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      minStock: 5,
      unit: "pcs",
      size: null,
      material: null,
      categoryId: "cat-1",
      storeId: "store-main",
      isActive: true,
      imageUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      category: { name: "Jasa" },
      stockGroup: { id: "group-1", baseUnit: "pcs", baseStock: 10 },
    };
    txMock.product.findMany.mockResolvedValue([existingProduct]);
    txMock.product.update.mockResolvedValue({
      ...existingProduct,
      price: 1200,
      costPrice: 800,
    });
    txMock.productPriceLog.createMany.mockResolvedValue({ count: 2 });
    txMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        batchOperationId: "batch-1",
        sourceRowNumber: 441,
        cursorIndex: 0,
        status: "PENDING",
        sku: "Cetakan R3-05",
        productId: "prod-1",
        commitAction: "update-price",
        rowData: {
          rowNumber: 441,
          name: "Cetakan R3-05",
          sku: "Cetakan R3-05",
          category: "Jasa",
          price: 1200,
          stock: 10,
          unit: "pcs",
          costPrice: 800,
          duplicateInFile: false,
          missingCategory: false,
          warnings: [],
          errors: [],
          autoAction: "auto_price_update",
          matchedProductId: "prod-1",
        },
      },
    ]);
    txMock.batchOperationItem.findMany.mockResolvedValue([]);
    txMock.batchOperationItem.create.mockResolvedValue({ id: "item-1" });
    txMock.batchOperationItem.createMany.mockResolvedValue({ count: 1 });
    txMock.batchOperationItem.count.mockResolvedValue(1);
    txMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchOperationId: "batch-1",
          cursor: 0,
          chunkSize: 75,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(txMock.$queryRaw).toHaveBeenCalled();
    expect(txMock.batchOperationItem.create).not.toHaveBeenCalled();
    expect(txMock.batchOperationItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            batchOperationId: "batch-1",
            productId: "prod-1",
            sku: "Cetakan R3-05",
            sourceRowNumber: 441,
            action: "UPDATE",
          }),
        ],
        skipDuplicates: true,
      }),
    );
    expect(txMock.productStockGroup.update).not.toHaveBeenCalled();
    expect(txMock.inventoryLog.create).not.toHaveBeenCalled();
  });

  it("clears Harga Dinas during price updates when the import row provided it as empty", async () => {
    const existingProduct = {
      id: "prod-1",
      name: "Acco plastik Joyko",
      sku: "A-001-PAK",
      barcode: null,
      description: null,
      price: 100000,
      costPrice: 70000,
      hargaDinas: 108000,
      hargaAgen: null,
      stock: 10,
      stockGroupId: "group-1",
      unitMultiplierToBase: 10,
      conversionNeedsReview: false,
      minStock: 5,
      unit: "Pak",
      size: null,
      material: null,
      categoryId: "cat-1",
      storeId: "store-main",
      isActive: true,
      imageUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      category: { name: "ATK" },
      stockGroup: { id: "group-1", baseUnit: "Dus", baseStock: 10 },
    };
    txMock.product.findMany.mockResolvedValue([existingProduct]);
    txMock.productPriceLog.createMany.mockResolvedValue({ count: 2 });
    txMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        batchOperationId: "batch-1",
        sourceRowNumber: 3,
        cursorIndex: 0,
        status: "PENDING",
        sku: "A-001-PAK",
        productId: "prod-1",
        commitAction: "update-price",
        rowData: {
          rowNumber: 3,
          name: "Acco plastik Joyko",
          sku: "A-001-PAK",
          category: "ATK",
          price: 108000,
          stock: 17.5,
          unit: "Pak",
          costPrice: 76000,
          hargaDinas: null,
          hargaDinasProvided: true,
          unitMultiplierToBase: 10,
          duplicateInFile: false,
          missingCategory: false,
          warnings: [],
          errors: [],
          autoAction: "auto_price_update",
          matchedProductId: "prod-1",
        },
      },
    ]);
    txMock.batchOperationItem.findMany.mockResolvedValue([]);
    txMock.batchOperationItem.createMany.mockResolvedValue({ count: 1 });
    txMock.batchOperationItem.count.mockResolvedValue(1);
    txMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchOperationId: "batch-1",
          cursor: 0,
          chunkSize: 75,
        }),
      }),
    );

    const priceUpdateCall = txMock.$queryRaw.mock.calls.find((call) =>
      Array.from(call[0] as TemplateStringsArray).join("").includes("\"hargaDinasProvided\""),
    );
    const priceUpdateSql = priceUpdateCall
      ? Array.from(priceUpdateCall[0] as TemplateStringsArray).join("")
      : "";

    expect(response.status).toBe(200);
    expect(priceUpdateSql).toContain(
      "\"hargaDinas\" = CASE WHEN v.\"hargaDinasProvided\" THEN v.\"hargaDinas\" ELSE p.\"hargaDinas\" END",
    );
    expect(priceUpdateCall).toContainEqual([true]);
  });

  it("targets the matched variant for price updates when the source row reuses the base SKU", async () => {
    const baseProduct = {
      id: "prod-base",
      name: "Amplop 90 Garda",
      sku: "A-006",
      barcode: null,
      description: null,
      price: 26500,
      costPrice: 19500,
      hargaDinas: 29500,
      hargaAgen: null,
      stock: 22,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      minStock: 5,
      unit: "Dus",
      size: null,
      material: null,
      categoryId: "cat-1",
      storeId: "store-main",
      isActive: true,
      imageUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      category: { name: "ATK" },
      stockGroup: { id: "group-1", baseUnit: "Dus", baseStock: 22 },
    };
    const variantProduct = {
      ...baseProduct,
      id: "prod-ball",
      sku: "A-006-BALL",
      price: 119.5,
      costPrice: 97.5,
      hargaDinas: null,
      stock: 0,
      unit: "Ball",
      unitMultiplierToBase: 5,
    };
    txMock.product.findMany.mockResolvedValue([baseProduct, variantProduct]);
    txMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        batchOperationId: "batch-1",
        sourceRowNumber: 13,
        cursorIndex: 0,
        status: "PENDING",
        sku: "A-006",
        productId: "prod-ball",
        commitAction: "update-price",
        rowData: {
          rowNumber: 13,
          name: "Amplop 90 Garda",
          sku: "A-006",
          category: "ATK",
          price: 119500,
          stock: 0,
          unit: "Ball",
          costPrice: 97500,
          unitMultiplierToBase: 5,
          duplicateInFile: false,
          missingCategory: false,
          warnings: [],
          errors: [],
          autoAction: "auto_price_update",
          matchedProductId: "prod-ball",
          matchedProductSku: "A-006-BALL",
        },
      },
    ]);
    txMock.batchOperationItem.findMany.mockResolvedValue([]);
    txMock.batchOperationItem.createMany.mockResolvedValue({ count: 1 });
    txMock.batchOperationItem.count.mockResolvedValue(1);
    txMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchOperationId: "batch-1",
          cursor: 0,
          chunkSize: 75,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(txMock.batchOperationItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            productId: "prod-ball",
            sku: "A-006",
            sourceRowNumber: 13,
            action: "UPDATE",
          }),
        ],
      }),
    );
  });

  it("repairs unit multipliers during price updates without touching stock", async () => {
    const existingProduct = {
      id: "prod-ball",
      name: "Amplop 90 Garda",
      sku: "A-006-BALL",
      barcode: null,
      description: null,
      price: 119500,
      costPrice: 97500,
      hargaDinas: null,
      hargaAgen: null,
      stock: 0,
      stockGroupId: "group-1",
      unitMultiplierToBase: 500,
      conversionNeedsReview: false,
      minStock: 5,
      unit: "Ball",
      size: null,
      material: null,
      categoryId: "cat-1",
      storeId: "store-main",
      isActive: true,
      imageUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      category: { name: "ATK" },
      stockGroup: { id: "group-1", baseUnit: "Dus", baseStock: 0 },
    };
    txMock.product.findMany.mockResolvedValue([existingProduct]);
    txMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        batchOperationId: "batch-1",
        sourceRowNumber: 13,
        cursorIndex: 0,
        status: "PENDING",
        sku: "A-006-BALL",
        productId: "prod-ball",
        commitAction: "update-price",
        rowData: {
          rowNumber: 13,
          name: "Amplop 90 Garda",
          sku: "A-006-BALL",
          category: "ATK",
          price: 119500,
          stock: 0,
          unit: "Ball",
          costPrice: 97500,
          unitMultiplierToBase: 5,
          duplicateInFile: false,
          missingCategory: false,
          warnings: [],
          errors: [],
          autoAction: "auto_price_update",
          autoActionReason: "Updated: same product and unit, unit multiplier changed.",
          matchedProductId: "prod-ball",
          matchedProductSku: "A-006-BALL",
        },
      },
    ]);
    txMock.batchOperationItem.findMany.mockResolvedValue([]);
    txMock.batchOperationItem.createMany.mockResolvedValue({ count: 1 });
    txMock.batchOperationItem.count.mockResolvedValue(1);
    txMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchOperationId: "batch-1",
          cursor: 0,
          chunkSize: 75,
        }),
      }),
    );

    const productUpdateSql = txMock.$queryRaw.mock.calls
      .map((call) => Array.from(call[0] as TemplateStringsArray).join(""))
      .join("\n");
    const priceUpdateCall = txMock.$queryRaw.mock.calls.find((call) =>
      Array.from(call[0] as TemplateStringsArray).join("").includes("\"unitMultiplierToBase\""),
    );

    expect(response.status).toBe(200);
    expect(productUpdateSql).toContain(
      "\"unitMultiplierToBase\" = COALESCE(v.\"unitMultiplierToBase\", p.\"unitMultiplierToBase\")",
    );
    expect(priceUpdateCall).toContainEqual([5]);
    expect(txMock.productStockGroup.update).not.toHaveBeenCalled();
    expect(txMock.inventoryLog.create).not.toHaveBeenCalled();
  });

  it("store-scopes bulk stock group updates for full product updates", async () => {
    const existingProduct = {
      id: "prod-update-1",
      name: "Amplop Lama",
      sku: "AMP-001",
      barcode: null,
      description: null,
      price: 1000,
      costPrice: 700,
      hargaDinas: null,
      hargaAgen: null,
      stock: 4,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      minStock: 5,
      unit: "pack",
      size: null,
      material: null,
      categoryId: "cat-1",
      storeId: "store-main",
      isActive: true,
      imageUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      category: { name: "Jasa" },
      stockGroup: { id: "group-1", baseUnit: "pack", baseStock: 4 },
    };
    txMock.product.findMany.mockResolvedValue([existingProduct]);
    txMock.productStockGroup.findMany.mockResolvedValue([
      {
        id: "group-1",
        storeId: "store-main",
        groupKey: "amplop baru|cat-1||",
        displayName: "Amplop Baru",
        baseUnit: "pack",
        baseStock: 4,
      },
    ]);
    txMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        batchOperationId: "batch-1",
        sourceRowNumber: 12,
        cursorIndex: 0,
        status: "PENDING",
        sku: "AMP-001",
        productId: "prod-update-1",
        commitAction: "update",
        rowData: {
          rowNumber: 12,
          name: "Amplop Baru",
          sku: "AMP-001",
          category: "Jasa",
          price: 1200,
          stock: 6,
          unit: "pack",
          costPrice: 800,
          duplicateInFile: false,
          missingCategory: false,
          warnings: [],
          errors: [],
          matchedProductId: "prod-update-1",
        },
      },
    ]);
    txMock.batchOperationItem.findMany.mockResolvedValue([]);
    txMock.batchOperationItem.createMany.mockResolvedValue({ count: 1 });
    txMock.batchOperationItem.count.mockResolvedValue(1);
    txMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchOperationId: "batch-1",
          cursor: 0,
          chunkSize: 75,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const stockGroupUpdateCall = txMock.$queryRaw.mock.calls.find((call) =>
      Array.from(call[0] as TemplateStringsArray).join("").includes("pos_product_stock_groups"),
    );
    expect(stockGroupUpdateCall).toBeTruthy();
    expect(stockGroupUpdateCall).toContain("store-main");
  });

  it("fast paths auto skipped rows without mutating products", async () => {
    const existingProduct = {
      id: "prod-skip-1",
      name: "Amplop Lama",
      sku: "AMP-001",
      barcode: null,
      description: null,
      price: 1000,
      costPrice: 800,
      hargaDinas: null,
      stock: 10,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      minStock: 5,
      unit: "pack",
      size: null,
      material: null,
      categoryId: "cat-1",
      storeId: "store-main",
      isActive: true,
      imageUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      category: { name: "Jasa" },
      stockGroup: { id: "group-1", baseUnit: "pack", baseStock: 10 },
    };
    txMock.product.findMany.mockResolvedValue([existingProduct]);
    txMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        batchOperationId: "batch-1",
        sourceRowNumber: 8,
        cursorIndex: 0,
        status: "PENDING",
        sku: "AMP-001",
        productId: "prod-skip-1",
        commitAction: "skip",
        rowData: {
          rowNumber: 8,
          name: "Amplop Lama",
          sku: "AMP-001",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pack",
          costPrice: 800,
          duplicateInFile: false,
          missingCategory: false,
          warnings: [],
          errors: [],
          autoAction: "auto_skip",
          matchedProductId: "prod-skip-1",
        },
      },
    ]);
    txMock.batchOperationItem.findMany.mockResolvedValue([]);
    txMock.batchOperationItem.createMany.mockResolvedValue({ count: 1 });
    txMock.batchOperationItem.count.mockResolvedValue(1);
    txMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchOperationId: "batch-1",
          cursor: 0,
          chunkSize: 75,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(txMock.product.update).not.toHaveBeenCalled();
    expect(txMock.product.create).not.toHaveBeenCalled();
    expect(txMock.$queryRaw).not.toHaveBeenCalled();
    expect(txMock.productPriceLog.createMany).not.toHaveBeenCalled();
    expect(txMock.batchOperationItem.create).not.toHaveBeenCalled();
    expect(txMock.batchOperationItem.createMany).not.toHaveBeenCalled();
  });
});

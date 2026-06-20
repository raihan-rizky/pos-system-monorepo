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
  category: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  batchOperation: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  batchOperationItem: {
    create: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  productImportPlannedRow: {
    count: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  productPriceLog: {
    createMany: vi.fn(),
  },
  productStockGroup: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  inventoryLog: {
    create: vi.fn(),
  },
};

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
  Prisma: {
    InputJsonValue: {},
  },
}));

describe("POST /api/products/import/commit", () => {
  let batchSummary: Record<string, unknown> = {};
  let batchStatus = "PENDING";
  let committedRowNumbers: number[] = [];
  let plannedRows: Array<{
    batchOperationId: string;
    sourceRowNumber: number;
    cursorIndex: number;
    status: string;
    sku: string;
    productId: string | null;
    commitAction: string;
    rowData: unknown;
  }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    batchSummary = {};
    batchStatus = "PENDING";
    committedRowNumbers = [];
    plannedRows = [];
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner",
      storeId: "store-main",
    });
    dbTransactionMock.mockImplementation((callback) => callback(txMock));
    txMock.category.findMany.mockResolvedValue([{ id: "cat-1", name: "Jasa" }]);
    txMock.batchOperation.create.mockImplementation(async ({ data }) => {
      batchSummary = data.summary;
      batchStatus = data.status;
      return { id: "batch-1", ...data };
    });
    txMock.batchOperation.findFirst.mockImplementation(async () => ({
      id: "batch-1",
      type: "PRODUCT_IMPORT",
      status: batchStatus,
      storeId: "store-main",
      summary: batchSummary,
    }));
    txMock.batchOperation.update.mockImplementation(async ({ data }) => {
      if (data.status) batchStatus = data.status;
      if (data.summary) batchSummary = data.summary;
      return { id: "batch-1", status: batchStatus, summary: batchSummary };
    });
    txMock.batchOperationItem.findMany.mockImplementation(async ({ where }) => {
      const rowNumbers = where.sourceRowNumber?.in ?? [];
      return committedRowNumbers
        .filter((rowNumber) => rowNumbers.includes(rowNumber))
        .map((sourceRowNumber) => ({ sourceRowNumber }));
    });
    txMock.batchOperationItem.count.mockImplementation(async () => committedRowNumbers.length);
    txMock.batchOperationItem.create.mockImplementation(async ({ data }) => {
      if (typeof data.sourceRowNumber === "number") {
        committedRowNumbers.push(data.sourceRowNumber);
      }
      return { id: `item-${committedRowNumbers.length}`, ...data };
    });
    txMock.productImportPlannedRow.createMany.mockImplementation(async ({ data }) => {
      plannedRows = data.map((row: any) => ({ ...row }));
      return { count: plannedRows.length };
    });
    txMock.productImportPlannedRow.findMany.mockImplementation(async ({ where }) => {
      const gte = where.cursorIndex?.gte ?? 0;
      const lt = where.cursorIndex?.lt ?? Number.MAX_SAFE_INTEGER;
      return plannedRows.filter(
        (row) =>
          row.batchOperationId === where.batchOperationId &&
          row.cursorIndex >= gte &&
          row.cursorIndex < lt,
      );
    });
    txMock.productImportPlannedRow.count.mockImplementation(async ({ where }) => {
      const rows = plannedRows.filter((row) => row.batchOperationId === where.batchOperationId);
      if (where.status?.not) return rows.filter((row) => row.status !== where.status.not).length;
      return rows.length;
    });
    txMock.productImportPlannedRow.updateMany.mockImplementation(async ({ where, data }) => {
      const rowNumbers = where.sourceRowNumber?.in ?? [];
      let count = 0;
      plannedRows = plannedRows.map((row) => {
        if (row.batchOperationId === where.batchOperationId && rowNumbers.includes(row.sourceRowNumber)) {
          count += 1;
          return { ...row, ...data };
        }
        return row;
      });
      return { count };
    });
    txMock.productStockGroup.findUnique.mockResolvedValue(null);
    txMock.productStockGroup.create.mockResolvedValue({
      id: "group-2",
      storeId: "store-main",
      groupKey: "amplop|jasa",
      displayName: "Amplop",
      baseUnit: "pack",
      baseStock: 10,
    });
    txMock.inventoryLog.create.mockResolvedValue({ id: "log-1" });
  });

  it("rejects large imports on the legacy endpoint instead of looping server-side", async () => {
    const rows = Array.from({ length: 76 }, (_, index) => ({
      rowNumber: index + 2,
      name: `Produk ${index + 1}`,
      sku: `SKU-${index + 1}`,
      category: "Jasa",
      price: 1000,
      stock: 1,
      unit: "pcs",
    }));

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify({ rows, decisions: {}, createMissingCategories: false }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toBe("Large product imports must use the chunked import flow");
    expect(txMock.batchOperation.create).not.toHaveBeenCalled();
  });

  it("handles a SKU conflict successfully when the user decides to create with new SKU", async () => {
    // prod-1 has SKU "FC-A4"
    txMock.product.findMany.mockResolvedValue([
      {
        id: "prod-1",
        name: "Fotocopy A4",
        sku: "FC-A4",
        category: { name: "Jasa" },
        unit: "lembar",
        price: 500,
        costPrice: 100,
        stockGroupId: "group-1",
        stockGroup: { baseUnit: "lembar" },
      },
    ]);

    // Import a row with the same SKU "FC-A4" but a different product name "Amplop" (conflict!)
    const payload = {
      rows: [
        {
          rowNumber: 2,
          name: "Amplop",
          sku: "FC-A4",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pack",
          costPrice: 800,
        },
      ],
      decisions: { "2": "create" },
    };

    txMock.product.create.mockResolvedValue({
      id: "prod-2",
      name: "Amplop",
      sku: "FC-A4-NEW",
    });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(201);
    expect(txMock.product.create).toHaveBeenCalled();
    // Verify it called create instead of update!
    expect(txMock.product.update).not.toHaveBeenCalled();
  });

  it("limits the initial product lookup to import candidates", async () => {
    txMock.product.findMany.mockResolvedValue([]);

    const payload = {
      rows: [
        {
          rowNumber: 2,
          name: "Amplop",
          sku: "AMP-001",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pack",
          matchedProductId: "prod-preview-1",
        },
      ],
      decisions: {},
    };

    txMock.product.create.mockResolvedValue({
      id: "prod-2",
      name: "Amplop",
      sku: "AMP-001",
    });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(201);
    expect(txMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          OR: expect.arrayContaining([
            { sku: { in: ["AMP-001"] } },
            { id: { in: ["prod-preview-1"] } },
            {
              categoryId: { in: ["cat-1"] },
              name: { in: ["Amplop"] },
            },
          ]),
        }),
        select: expect.objectContaining({
          id: true,
          sku: true,
          category: { select: { name: true } },
          stockGroup: { select: { id: true, baseUnit: true, baseStock: true } },
        }),
      }),
    );
  });

  it("commits same-family duplicate SKUs when all duplicate rows are marked create", async () => {
    txMock.product.findMany.mockResolvedValue([]);
    txMock.product.create
      .mockResolvedValueOnce({
        id: "prod-1",
        name: "Amplop",
        sku: "AMP",
      })
      .mockResolvedValueOnce({
        id: "prod-2",
        name: "Amplop",
        sku: "AMP-PCS",
      });

    const payload = {
      rows: [
        {
          rowNumber: 2,
          name: "Amplop",
          sku: "AMP",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pack",
        },
        {
          rowNumber: 3,
          name: "Amplop",
          sku: "AMP",
          category: "Jasa",
          price: 1000,
          stock: 0,
          unit: "pcs",
        },
      ],
      decisions: { "2": "create", "3": "create" },
    };

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.createdProductCount).toBe(2);
    expect(body.variantProductCount).toBe(1);
    expect(txMock.product.create).toHaveBeenCalledTimes(2);
    expect(txMock.product.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ sku: "AMP" }),
      }),
    );
    expect(txMock.product.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ sku: "AMP-PCS" }),
      }),
    );
  });

  it("rejects same SKU/name/category/unit rows with conflicting price data until decisions are explicit", async () => {
    txMock.product.findMany.mockResolvedValue([]);

    const payload = {
      rows: [
        {
          rowNumber: 2,
          name: "Amplop",
          sku: "AMP",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pcs",
          costPrice: 800,
        },
        {
          rowNumber: 3,
          name: "Amplop",
          sku: "AMP",
          category: "Jasa",
          price: 1200,
          stock: 10,
          unit: "pcs",
          costPrice: 800,
        },
      ],
      decisions: {},
    };

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toBe(
      "Import contains same-unit price conflicts. Choose at most one update and skip the rest.",
    );
    expect(body.conflictGroups).toEqual([
      expect.objectContaining({
        sku: "AMP",
        unit: "pcs",
        rowNumbers: [2, 3],
        prices: [
          { rowNumber: 2, price: 1000, costPrice: 800, hargaDinas: null },
          { rowNumber: 3, price: 1200, costPrice: 800, hargaDinas: null },
        ],
      }),
    ]);
    expect(txMock.product.create).not.toHaveBeenCalled();
    expect(txMock.product.update).not.toHaveBeenCalled();
  });

  it("commits one selected same-unit price conflict row and skips the rest", async () => {
    txMock.product.findMany.mockResolvedValue([]);
    txMock.product.create.mockResolvedValue({
      id: "prod-1",
      name: "Amplop",
      sku: "AMP",
      price: 1200,
      costPrice: 800,
    });

    const payload = {
      rows: [
        {
          rowNumber: 2,
          name: "Amplop",
          sku: "AMP",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pcs",
          costPrice: 800,
        },
        {
          rowNumber: 3,
          name: "Amplop",
          sku: "AMP",
          category: "Jasa",
          price: 1200,
          stock: 10,
          unit: "pcs",
          costPrice: 800,
        },
      ],
      decisions: { "2": "skip", "3": "update" },
    };

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.createdProductCount).toBe(1);
    expect(body.skippedRowCount).toBe(1);
    expect(txMock.product.create).toHaveBeenCalledTimes(1);
    expect(txMock.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sku: "AMP",
          price: 1200,
        }),
      }),
    );
  });

  it("rejects duplicate active final SKUs after decisions are resolved", async () => {
    txMock.product.findMany.mockResolvedValue([
      {
        id: "prod-1",
        name: "Stabilo Boss",
        sku: "STABILO-019",
        barcode: null,
        description: null,
        price: 10000,
        costPrice: 8000,
        hargaDinas: null,
        stock: 5,
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
        stockGroup: { id: "group-1", baseUnit: "pcs", baseStock: 5 },
      },
    ]);

    const payload = {
      rows: [
        {
          rowNumber: 2,
          name: "Stabilo Boss",
          sku: "STABILO-019",
          category: "Jasa",
          price: 12000,
          stock: 5,
          unit: "pcs",
          costPrice: 8500,
        },
        {
          rowNumber: 3,
          name: "Stabilo Boss",
          sku: "STABILO-019",
          category: "Jasa",
          price: 12000,
          stock: 6,
          unit: "pcs",
          costPrice: 8500,
        },
      ],
      decisions: { "2": "update", "3": "update" },
    };

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      message: "Import contains duplicate SKUs. Mark extra rows as skip.",
      duplicateSkus: ["STABILO-019"],
    });
    expect(txMock.product.update).not.toHaveBeenCalled();
  });

  it("commits duplicate final SKU rows when extras are skipped", async () => {
    const existingProduct = {
      id: "prod-1",
      name: "Stabilo Boss",
      sku: "STABILO-019",
      barcode: null,
      description: null,
      price: 10000,
      costPrice: 8000,
      hargaDinas: null,
      stock: 5,
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
      stockGroup: { id: "group-1", baseUnit: "pcs", baseStock: 5 },
    };
    txMock.product.findMany.mockResolvedValue([existingProduct]);
    txMock.product.update.mockResolvedValue({
      ...existingProduct,
      price: 12000,
      costPrice: 8500,
      stock: 6,
    });

    const payload = {
      rows: [
        {
          rowNumber: 2,
          name: "Stabilo Boss",
          sku: "STABILO-019",
          category: "Jasa",
          price: 12000,
          stock: 5,
          unit: "pcs",
          costPrice: 8500,
        },
        {
          rowNumber: 3,
          name: "Stabilo Boss",
          sku: "STABILO-019",
          category: "Jasa",
          price: 12000,
          stock: 6,
          unit: "pcs",
          costPrice: 8500,
        },
      ],
      decisions: { "2": "skip", "3": "update" },
    };

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.updatedProductCount).toBe(1);
    expect(body.skippedRowCount).toBe(1);
    expect(txMock.product.update).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: { $transaction: dbTransactionMock },
  Prisma: {},
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import {
  PRODUCT_IMPORT_CHUNK_SIZE,
  commitProductImportChunk,
  productImportChunkSchema,
  productImportStartSchema,
  startProductImportCommit,
} from "../product-import-commit-service";

const row = {
  rowNumber: 2,
  name: "Amplop",
  sku: "AMP-001",
  category: "ATK",
  price: 1000,
  stock: 10,
  unit: "pcs",
  duplicateInFile: false,
  missingCategory: false,
  warnings: [],
  errors: [],
};

describe("product import commit schemas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbTransactionMock.mockResolvedValue({});
  });

  it("accepts the raised default chunk size for start and chunk payloads", () => {
    expect(PRODUCT_IMPORT_CHUNK_SIZE).toBe(500);
    expect(
      productImportStartSchema.parse({
        rows: [row],
        decisions: {},
        createMissingCategories: false,
        chunkSize: PRODUCT_IMPORT_CHUNK_SIZE,
      }).chunkSize,
    ).toBe(PRODUCT_IMPORT_CHUNK_SIZE);
    expect(
      productImportChunkSchema.parse({
        batchOperationId: "batch-1",
        cursor: 0,
        chunkSize: PRODUCT_IMPORT_CHUNK_SIZE,
      }).chunkSize,
    ).toBe(PRODUCT_IMPORT_CHUNK_SIZE);
  });

  it("rejects a suspicious bulk price/HPP inversion before opening a transaction", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      ...row,
      rowNumber: index + 2,
      name: `Produk ${index + 1}`,
      sku: `SKU-${index + 1}`,
      price: index < 8 ? 100 : 200,
      costPrice: 150,
    }));

    await expect(
      startProductImportCommit(
        { rows, decisions: {}, createMissingCategories: false },
        { id: "user-1", storeId: "store-main" },
      ),
    ).rejects.toThrow("PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED:8:10");
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("locks existing groups before products and reloads shared stock before creating a variant", async () => {
    const events: string[] = [];
    const productFindManyMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        events.push("read:hint");
        return [existingProduct(20)];
      })
      .mockImplementationOnce(async () => {
        events.push("read:fresh");
        return [existingProduct(30)];
      });
    const queryRawMock = vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join(" ");
        if (sql.includes("FOR UPDATE") && sql.includes("pos_product_stock_groups")) {
          events.push("lock:group");
          return [{ id: "group-1" }];
        }
        if (sql.includes("FOR UPDATE") && sql.includes("pos_products")) {
          events.push("lock:product");
          return [{ id: "prod-existing" }];
        }
        if (sql.includes("INSERT INTO pos_products")) {
          events.push("write:variant");
          expect(values[9]).toEqual([15]);
          return [];
        }
        return [];
      },
    );

    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        batchOperation: {
          findFirst: vi.fn().mockResolvedValue({
            id: "batch-1",
            status: "PENDING",
            summary: {},
          }),
          update: vi.fn().mockResolvedValue({ id: "batch-1" }),
        },
        productImportPlannedRow: {
          findMany: vi.fn().mockResolvedValue([
            {
              rowData: {
                ...row,
                sku: "AMP-VARIANT",
                stock: 999,
                stockProvided: true,
                unitMultiplierToBase: 2,
                matchedProductId: "prod-existing",
                autoAction: "auto_create_variant",
              },
              commitAction: "create-variant",
            },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          count: vi.fn().mockResolvedValue(1),
        },
        batchOperationItem: {
          findMany: vi.fn().mockResolvedValue([]),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          count: vi.fn().mockResolvedValue(1),
        },
        category: {
          findMany: vi.fn().mockResolvedValue([{ id: "cat-1", name: "ATK" }]),
        },
        product: {
          findMany: productFindManyMock,
        },
        productPriceLog: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        $queryRaw: queryRawMock,
      }),
    );

    await commitProductImportChunk(
      {
        batchOperationId: "batch-1",
        cursor: 0,
        chunkSize: 1,
      },
      { id: "user-1", storeId: "store-main" },
    );

    expect(events).toEqual([
      "read:hint",
      "lock:group",
      "lock:product",
      "read:fresh",
      "write:variant",
    ]);
  });
});

function existingProduct(baseStock: number) {
  return {
    id: "prod-existing",
    name: "Amplop",
    sku: "AMP-BOX",
    barcode: null,
    description: null,
    price: 1000,
    costPrice: 500,
    hargaDinas: null,
    hargaAgen: null,
    stock: baseStock / 10,
    stockGroupId: "group-1",
    unitMultiplierToBase: 10,
    conversionNeedsReview: false,
    minStock: 5,
    unit: "box",
    size: null,
    material: null,
    categoryId: "cat-1",
    brandId: null,
    storeId: "store-main",
    isActive: true,
    imageUrl: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    category: { name: "ATK" },
    stockGroup: {
      id: "group-1",
      baseUnit: "pcs",
      baseStock,
    },
    productSuppliers: [],
  };
}

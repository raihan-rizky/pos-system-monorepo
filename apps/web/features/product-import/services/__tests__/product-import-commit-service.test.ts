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
});

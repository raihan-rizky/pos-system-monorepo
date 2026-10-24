import { beforeEach, describe, expect, it, vi } from "vitest";
import { importPricingDatabase } from "./import-pricing-database";

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

  it("assigns sales groups to known and unknown categories created during import", async () => {
    const createdCategories: Array<{ name: string; salesGroup?: string }> = [];
    const rows = [
      { ...row, name: "Cartridge", sku: "CART-001", category: "Cardridge Canon" },
      { ...row, name: "Ink", sku: "INK-001", category: "Tinta Printing" },
      { ...row, name: "Plano", sku: "PLN-001", category: "Plano" },
    ];

    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        category: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation(async ({ data }) => {
            createdCategories.push(data);
            return { ...data, id: `category-${createdCategories.length}` };
          }),
        },
        product: { findMany: vi.fn().mockResolvedValue([]) },
        batchOperation: { create: vi.fn().mockResolvedValue({ id: "batch-1" }) },
        productImportPlannedRow: { createMany: vi.fn().mockResolvedValue({ count: rows.length }) },
      }),
    );

    await startProductImportCommit(
      { rows, decisions: {}, createMissingCategories: true },
      { id: "user-1", storeId: "store-main" },
    );

    expect(createdCategories.map(({ name, salesGroup }) => [name, salesGroup])).toEqual([
      ["Cardridge Canon", "CARTRIDGE"],
      ["Tinta Printing", "INK"],
      ["Plano", "OTHER"],
    ]);
  });

  it("locks existing groups before products and reloads shared stock before creating a variant", async () => {
    const d = importPricingDatabase();
    dbTransactionMock.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 100000, 80000);
    d.planned[0].commitAction = "create-variant";
    d.planned[0].rowData = { ...d.planned[0].rowData, sku: "HVS-NEW", unit: "pak", stock: 999, stockProvided: true, unitMultiplierToBase: 2, autoAction: "auto_create_variant" };
    const query = d.tx.$queryRaw.getMockImplementation();
    d.tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join(" ").includes("pos_product_stock_groups") && strings.join(" ").includes("FOR UPDATE")) d.groups[0].baseStock = 30;
      return query(strings, ...values);
    });
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, { id: "user-1", storeId: "store-main" });
    expect(d.products.find(p => p.sku === "HVS-NEW")?.stock).toBe(15);
    expect(d.locks.slice(0, 4)).toEqual(["batch:batch", "group:group-1", "product:dus", "product:rim"]);
  });
});

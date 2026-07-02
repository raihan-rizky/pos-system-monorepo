import { describe, expect, it, vi } from "vitest";

vi.mock("@pos/db", () => ({
  db: {},
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
});

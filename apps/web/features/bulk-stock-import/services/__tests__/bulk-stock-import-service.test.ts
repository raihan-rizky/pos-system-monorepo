import { describe, expect, it, vi } from "vitest";

import {
  BulkStockImportValidationError,
  commitBulkStockImport,
  previewBulkStockImport,
} from "../bulk-stock-import-service";
import type { BulkStockImportRepository } from "../../repositories/BulkStockImportRepository";

describe("commitBulkStockImport", () => {
  it("previews matched, skipped, and duplicate rows through the repository", async () => {
    const repository = {
      findActiveProductsForStockImport: vi.fn().mockResolvedValue([
        product("prod-a", "Kertas HVS A4", "ATK", "Rim", 10),
      ]),
      findActiveSupplierById: vi.fn(),
      commitStockImport: vi.fn(),
    } satisfies BulkStockImportRepository;

    const result = await previewBulkStockImport(repository, {
      storeId: "store-1",
      records: [
        { name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 5 },
        { name: "kertas hvs a4", category: "atk", unit: "rim", stock: 3 },
        { name: "Produk Hilang", category: "ATK", unit: "pcs", stock: 2 },
      ],
    });

    expect(result.summary).toEqual({
      validRows: 2,
      skippedRows: 1,
      errorRows: 0,
      warningRows: 2,
    });
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        productId: "prod-a",
        status: "valid",
      }),
    );
    expect(result.rows[2]).toEqual(
      expect.objectContaining({
        productId: null,
        status: "skipped",
      }),
    );
  });

  it("builds add-mode impacts with optional supplier and generated note", async () => {
    const repository = {
      findActiveProductsForStockImport: vi.fn().mockResolvedValue([
        product("prod-a", "Kertas HVS A4", "ATK", "Rim", 10),
        product("prod-b", "Pulpen Pilot", "ATK", "pcs", 7),
      ]),
      findActiveSupplierById: vi.fn().mockResolvedValue({
        id: "supplier-1",
        name: "CV Sinar Jaya",
      }),
      commitStockImport: vi.fn().mockResolvedValue({
        updatedProductCount: 2,
        inventoryLogCount: 2,
        batchOperationId: "batch-1",
        status: "COMMITTED",
        pendingApproval: false,
        undoAvailable: true,
      }),
    } satisfies BulkStockImportRepository;

    const result = await commitBulkStockImport(repository, {
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-1",
      },
      mode: "ADD",
      rows: [
        { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 5 },
        { rowNumber: 3, name: "kertas hvs a4", category: "atk", unit: "rim", stock: 3 },
        { rowNumber: 4, name: "Pulpen Pilot", category: "ATK", unit: "pcs", stock: 4 },
      ],
      supplierId: "supplier-1",
      note: "",
    });

    expect(result.batchOperationId).toBe("batch-1");
    expect(repository.commitStockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        user: expect.objectContaining({ id: "owner-1", role: "OWNER" }),
        mode: "ADD",
        supplier: { id: "supplier-1", name: "CV Sinar Jaya" },
        note: "Bulk stock import",
        impacts: [
          expect.objectContaining({
            productId: "prod-a",
            quantity: 8,
            delta: 8,
            afterStock: 18,
          }),
          expect.objectContaining({
            productId: "prod-b",
            quantity: 4,
            delta: 4,
            afterStock: 11,
          }),
        ],
      }),
    );
  });

  it("uses the last duplicate row for set mode", async () => {
    const repository = {
      findActiveProductsForStockImport: vi.fn().mockResolvedValue([
        product("prod-a", "Kertas HVS A4", "ATK", "Rim", 10),
      ]),
      findActiveSupplierById: vi.fn(),
      commitStockImport: vi.fn().mockResolvedValue({
        updatedProductCount: 1,
        inventoryLogCount: 1,
        batchOperationId: "batch-1",
        status: "PENDING",
        pendingApproval: true,
        undoAvailable: false,
      }),
    } satisfies BulkStockImportRepository;

    await commitBulkStockImport(repository, {
      user: {
        id: "admin-1",
        name: "Admin",
        role: "ADMIN",
        storeId: "store-1",
      },
      mode: "SET",
      rows: [
        { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 15 },
        { rowNumber: 3, name: "kertas hvs a4", category: "atk", unit: "rim", stock: 6 },
      ],
      note: "opname rak depan",
    });

    expect(repository.findActiveSupplierById).not.toHaveBeenCalled();
    expect(repository.commitStockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "SET",
        supplier: null,
        note: "opname rak depan",
        impacts: [
          expect.objectContaining({
            productId: "prod-a",
            quantity: 6,
            delta: -4,
            afterStock: 6,
            sourceRowNumbers: [3],
          }),
        ],
      }),
    );
  });

  it("skips unchanged set-mode rows before repository commit", async () => {
    const repository = {
      findActiveProductsForStockImport: vi.fn().mockResolvedValue([
        product("prod-a", "Kertas HVS A4", "ATK", "Rim", 10),
        product("prod-b", "Pulpen Pilot", "ATK", "pcs", 7),
      ]),
      findActiveSupplierById: vi.fn(),
      commitStockImport: vi.fn().mockResolvedValue({
        updatedProductCount: 1,
        inventoryLogCount: 1,
        batchOperationId: "batch-1",
        status: "COMMITTED",
        pendingApproval: false,
        undoAvailable: true,
      }),
    } satisfies BulkStockImportRepository;

    await commitBulkStockImport(repository, {
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-1",
      },
      mode: "SET",
      rows: [
        { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 10 },
        { rowNumber: 3, name: "Pulpen Pilot", category: "ATK", unit: "pcs", stock: 8 },
      ],
    });

    expect(repository.commitStockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        impacts: [
          expect.objectContaining({
            productId: "prod-b",
            quantity: 8,
            delta: 1,
          }),
        ],
      }),
    );
  });

  it("rejects set-mode imports when all matched rows are unchanged", async () => {
    const repository = {
      findActiveProductsForStockImport: vi.fn().mockResolvedValue([
        product("prod-a", "Kertas HVS A4", "ATK", "Rim", 10),
      ]),
      findActiveSupplierById: vi.fn(),
      commitStockImport: vi.fn(),
    } satisfies BulkStockImportRepository;

    await expect(
      commitBulkStockImport(repository, {
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-1",
        },
        mode: "SET",
        rows: [
          { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 10 },
        ],
      }),
    ).rejects.toBeInstanceOf(BulkStockImportValidationError);
    expect(repository.commitStockImport).not.toHaveBeenCalled();
  });

  it("commits a manually selected product for an ambiguous row", async () => {
    const repository = {
      findActiveProductsForStockImport: vi.fn().mockResolvedValue([
        product("prod-dup-1", "Map Plastik", "ATK", "pcs", 3),
        product("prod-dup-2", "Map Plastik", "ATK", "pcs", 9),
      ]),
      findActiveSupplierById: vi.fn(),
      commitStockImport: vi.fn().mockResolvedValue({
        updatedProductCount: 1,
        inventoryLogCount: 1,
        batchOperationId: "batch-1",
        status: "COMMITTED",
        pendingApproval: false,
        undoAvailable: true,
      }),
    } satisfies BulkStockImportRepository;

    await commitBulkStockImport(repository, {
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-1",
      },
      mode: "ADD",
      rows: [
        {
          rowNumber: 2,
          name: "Map Plastik",
          category: "ATK",
          unit: "pcs",
          stock: 4,
          selectedProductId: "prod-dup-2",
        },
      ],
    });

    expect(repository.commitStockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        impacts: [
          expect.objectContaining({
            productId: "prod-dup-2",
            quantity: 4,
            delta: 4,
            beforeStock: 9,
            afterStock: 13,
          }),
        ],
      }),
    );
  });

  it("rejects stale selected product ids that no longer match the row identity", async () => {
    const repository = {
      findActiveProductsForStockImport: vi.fn().mockResolvedValue([
        product("prod-other", "Map Plastik", "Lain", "pcs", 3),
        product("prod-dup-2", "Map Plastik", "ATK", "pcs", 9),
      ]),
      findActiveSupplierById: vi.fn(),
      commitStockImport: vi.fn(),
    } satisfies BulkStockImportRepository;

    await expect(
      commitBulkStockImport(repository, {
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-1",
        },
        mode: "ADD",
        rows: [
          {
            rowNumber: 2,
            name: "Map Plastik",
            category: "ATK",
            unit: "pcs",
            stock: 4,
            selectedProductId: "prod-other",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BulkStockImportValidationError);
    expect(repository.commitStockImport).not.toHaveBeenCalled();
  });

  it("rejects negative add-mode quantities before repository commit", async () => {
    const repository = {
      findActiveProductsForStockImport: vi.fn().mockResolvedValue([
        product("prod-a", "Kertas HVS A4", "ATK", "Rim", 10),
      ]),
      findActiveSupplierById: vi.fn(),
      commitStockImport: vi.fn(),
    } satisfies BulkStockImportRepository;

    await expect(
      commitBulkStockImport(repository, {
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-1",
        },
        mode: "ADD",
        rows: [
          { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: -1 },
        ],
      }),
    ).rejects.toBeInstanceOf(BulkStockImportValidationError);
    expect(repository.commitStockImport).not.toHaveBeenCalled();
  });

  it("rejects negative add-mode rows even when duplicate totals are positive", async () => {
    const repository = {
      findActiveProductsForStockImport: vi.fn().mockResolvedValue([
        product("prod-a", "Kertas HVS A4", "ATK", "Rim", 10),
      ]),
      findActiveSupplierById: vi.fn(),
      commitStockImport: vi.fn(),
    } satisfies BulkStockImportRepository;

    await expect(
      commitBulkStockImport(repository, {
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-1",
        },
        mode: "ADD",
        rows: [
          { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: -1 },
          { rowNumber: 3, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 5 },
        ],
      }),
    ).rejects.toBeInstanceOf(BulkStockImportValidationError);
    expect(repository.commitStockImport).not.toHaveBeenCalled();
  });

  it("allows negative add-mode rows when negative stock is explicitly enabled", async () => {
    const repository = {
      findActiveProductsForStockImport: vi.fn().mockResolvedValue([
        product("prod-a", "Kertas HVS A4", "ATK", "Rim", 10),
      ]),
      findActiveSupplierById: vi.fn(),
      commitStockImport: vi.fn().mockResolvedValue({
        updatedProductCount: 1,
        inventoryLogCount: 1,
        batchOperationId: "batch-1",
        status: "COMMITTED",
        pendingApproval: false,
        undoAvailable: true,
      }),
    } satisfies BulkStockImportRepository;

    await commitBulkStockImport(repository, {
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-1",
      },
      mode: "ADD",
      rows: [
        { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: -3 },
      ],
      allowNegativeStock: true,
    });

    expect(repository.commitStockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        allowNegativeStock: true,
        impacts: [
          expect.objectContaining({
            productId: "prod-a",
            quantity: -3,
            delta: -3,
            afterStock: 7,
          }),
        ],
      }),
    );
  });
});

function product(
  id: string,
  name: string,
  categoryName: string,
  unit: string,
  stock: number,
) {
  return {
    id,
    name,
    sku: id,
    categoryName,
    unit,
    stock,
  };
}

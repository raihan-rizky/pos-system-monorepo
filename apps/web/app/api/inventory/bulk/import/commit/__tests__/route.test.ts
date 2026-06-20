import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";
import { StockMutationError } from "@/features/product-stock-groups/stock-mutations";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const findActiveProductsForStockImportMock = vi.hoisted(() => vi.fn());
const findActiveSupplierByIdMock = vi.hoisted(() => vi.fn());
const commitStockImportMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  }),
}));

vi.mock("@/features/bulk-stock-import/repositories/BulkStockImportRepository", () => ({
  bulkStockImportRepository: {
    findActiveProductsForStockImport: findActiveProductsForStockImportMock,
    findActiveSupplierById: findActiveSupplierByIdMock,
    commitStockImport: commitStockImportMock,
  },
}));

describe("POST /api/inventory/bulk/import/commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-1",
    });
    findActiveProductsForStockImportMock.mockResolvedValue([
      {
        id: "prod-a",
        name: "Kertas HVS A4",
        sku: "SKU-A",
        categoryName: "ATK",
        unit: "Rim",
        stock: 10,
      },
    ]);
    findActiveSupplierByIdMock.mockResolvedValue(null);
    commitStockImportMock.mockResolvedValue({
      updatedProductCount: 1,
      inventoryLogCount: 1,
      batchOperationId: "batch-1",
      status: "COMMITTED",
      pendingApproval: false,
      undoAvailable: true,
    });
  });

  it("commits a stock import with validated rows", async () => {
    const response = await request({
      mode: "ADD",
      rows: [
        { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 5 },
      ],
      note: "",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(body).toEqual({
      updatedProductCount: 1,
      inventoryLogCount: 1,
      batchOperationId: "batch-1",
      status: "COMMITTED",
      pendingApproval: false,
      undoAvailable: true,
    });
    expect(commitStockImportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "ADD",
        note: "Bulk stock import",
        allowNegativeStock: false,
        impacts: [
          expect.objectContaining({
            productId: "prod-a",
            delta: 5,
          }),
        ],
      }),
    );
  });

  it("rejects invalid stock mode", async () => {
    const response = await request({
      mode: "BAD",
      rows: [
        { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 5 },
      ],
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toBe("Validation error");
    expect(commitStockImportMock).not.toHaveBeenCalled();
  });

  it("maps insufficient stock mutation failures to validation errors", async () => {
    commitStockImportMock.mockRejectedValue(
      new StockMutationError("INSUFFICIENT_STOCK", {
        productId: "prod-a",
        available: 2,
        requested: 5,
      }),
    );

    const response = await request({
      mode: "SET",
      rows: [
        { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: -5 },
      ],
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe("ValidationError");
    expect(body.message).toBe("Stock cannot be negative or insufficient");
    expect(body.errors.stock).toContain("Stock cannot be negative or insufficient");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "inventory.bulk_import.commit.validation_failed",
      expect.objectContaining({
        reason: "INSUFFICIENT_STOCK",
        mode: "SET",
        rowCount: 1,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("logs commit start and validation failures with row counts", async () => {
    const response = await request({
      mode: "BAD",
      rows: [
        { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 5 },
      ],
    });

    expect(response.status).toBe(422);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "inventory.bulk_import.commit.started",
      expect.objectContaining({
        userId: "owner-1",
        storeId: "store-1",
        rowCount: 1,
      }),
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "inventory.bulk_import.commit.validation_failed",
      expect.objectContaining({
        reason: "ZOD_VALIDATION",
        rowCount: 1,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("passes allowNegativeStock through validated input", async () => {
    const response = await request({
      mode: "SET",
      allowNegativeStock: true,
      rows: [
        { rowNumber: 2, name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: -5 },
      ],
    });

    expect(response.status).toBe(201);
    expect(commitStockImportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowNegativeStock: true,
      }),
    );
  });

  it("commits a selected product for an ambiguous stock row", async () => {
    findActiveProductsForStockImportMock.mockResolvedValue([
      {
        id: "prod-dup-1",
        name: "Map Plastik",
        sku: "SKU-DUP-1",
        categoryName: "ATK",
        unit: "pcs",
        stock: 3,
      },
      {
        id: "prod-dup-2",
        name: "Map Plastik",
        sku: "SKU-DUP-2",
        categoryName: "ATK",
        unit: "pcs",
        stock: 9,
      },
    ]);

    const response = await request({
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

    expect(response.status).toBe(201);
    expect(commitStockImportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        impacts: [
          expect.objectContaining({
            productId: "prod-dup-2",
            delta: 4,
            afterStock: 13,
          }),
        ],
      }),
    );
  });
});

function request(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory/bulk/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

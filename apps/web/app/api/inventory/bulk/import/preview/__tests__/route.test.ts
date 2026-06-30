import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const findActiveProductsForStockImportMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/features/bulk-stock-import/repositories/BulkStockImportRepository", () => ({
  bulkStockImportRepository: {
    findActiveProductsForStockImport: findActiveProductsForStockImportMock,
  },
}));

describe("POST /api/inventory/bulk/import/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
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
  });

  it("previews matched and skipped stock import rows", async () => {
    const response = await POST(request(workbookFile([
      ["Name Product", "Kategori", "Satuan", "Stok"],
      ["kertas hvs a4", "atk", "rim", 5],
      ["Produk Hilang", "ATK", "pcs", 2],
    ])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(body.summary).toEqual({
      validRows: 1,
      skippedRows: 1,
      errorRows: 0,
      warningRows: 0,
    });
    expect(body.rows[0]).toEqual(
      expect.objectContaining({
        status: "valid",
        productId: "prod-a",
      }),
    );
    expect(body.rows[1]).toEqual(
      expect.objectContaining({
        status: "skipped",
        productId: null,
      }),
    );
  });

  it("returns missing required columns before previewing", async () => {
    const response = await POST(request(workbookFile([
      ["Name Product", "Stok"],
      ["Kertas HVS A4", 5],
    ])));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe("MISSING_REQUIRED_COLUMNS");
    expect(body.missingColumns).toEqual(["category", "unit"]);
    expect(findActiveProductsForStockImportMock).not.toHaveBeenCalled();
  });

  it("rejects oversized import files before parsing stock rows", async () => {
    const response = await POST(request(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "stock-import.xlsx"),
    ));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.message).toContain("terlalu besar");
    expect(findActiveProductsForStockImportMock).not.toHaveBeenCalled();
  });
});

function request(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return new Request("http://localhost/api/inventory/bulk/import/preview", {
    method: "POST",
    body: formData,
  });
}

function workbookFile(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([buffer], "stock-import.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

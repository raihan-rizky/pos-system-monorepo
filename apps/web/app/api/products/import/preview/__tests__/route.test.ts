import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const categoryFindManyMock = vi.hoisted(() => vi.fn());
const supplierFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findMany: productFindManyMock,
    },
    category: {
      findMany: categoryFindManyMock,
    },
    supplier: {
      findMany: supplierFindManyMock,
    },
  },
}));

describe("POST /api/products/import/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner",
      storeId: "store-main",
    });
    productFindManyMock.mockResolvedValue([
      {
        id: "prod-1",
        name: "Fotocopy A4",
        sku: "FC-A4",
        unit: "lembar",
        price: 500,
        costPrice: 100,
        stockGroupId: "group-1",
        category: { name: "Jasa" },
        stockGroup: { baseUnit: "lembar" },
      },
    ]);
    categoryFindManyMock.mockResolvedValue([{ name: "Jasa" }]);
    supplierFindManyMock.mockResolvedValue([]);
  });

  it("returns an auto-skip decision for case-insensitive duplicate product names after abbreviation expansion", async () => {
    const formData = new FormData();
    formData.set(
      "file",
      new File(
        ["name,sku,category,price,stock,unit,costPrice\nfc a4,IMPORT-1,jasa,500,10,lembar,100"],
        "products.csv",
        { type: "text/csv" },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/products/import/preview", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rows[0]).toEqual(
      expect.objectContaining({
        autoAction: "auto_skip",
        matchedProductId: "prod-1",
        normalizedProductKey: "fotocopy a4|jasa",
      }),
    );
  });

  it("rejects oversized import files before parsing reference data", async () => {
    const formData = new FormData();
    formData.set(
      "file",
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "products.xlsx"),
    );

    const response = await POST(
      new Request("http://localhost/api/products/import/preview", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.message).toContain("terlalu besar");
    expect(productFindManyMock).not.toHaveBeenCalled();
    expect(categoryFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects a bulk import when at least 80% of comparable selling prices are below HPP", async () => {
    productFindManyMock.mockResolvedValue([]);
    const dataRows = Array.from({ length: 10 }, (_, index) => {
      const price = index < 8 ? 100 : 200;
      return `Produk ${index + 1},SKU-${index + 1},Jasa,${price},10,pcs,150`;
    });
    const formData = new FormData();
    formData.set(
      "file",
      new File(
        [["name,sku,category,price,stock,unit,costPrice", ...dataRows].join("\n")],
        "products.csv",
        { type: "text/csv" },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/products/import/preview", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      code: "PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED",
      message:
        "Mayoritas Harga Jual lebih rendah daripada HPP. Periksa kembali mapping kolom Harga Jual dan HPP sebelum melanjutkan import.",
      comparableRowCount: 10,
      priceBelowCostRowCount: 8,
    });
  });

  it("marks all same SKU/name/category/unit rows with conflicting price data as unresolved conflicts", async () => {
    productFindManyMock.mockResolvedValue([]);

    const formData = new FormData();
    formData.set(
      "file",
      new File(
        [[
          "name,sku,category,price,stock,unit,costPrice,hargaDinas",
          "Amplop,AMP,Jasa,1000,10,pcs,800,1500",
          "Amplop,AMP,Jasa,1200,10,pcs,800,1500",
        ].join("\n")],
        "products.csv",
        { type: "text/csv" },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/products/import/preview", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rows.map((row: { autoAction?: string }) => row.autoAction)).toEqual([
      "same_unit_price_conflict",
      "same_unit_price_conflict",
    ]);
    expect(body.rows.every((row: { errors: string[] }) => row.errors.length > 0)).toBe(true);
  });

  it("warns for product import supplier codes that do not exist", async () => {
    productFindManyMock.mockResolvedValue([]);
    supplierFindManyMock.mockResolvedValue([
      { id: "supplier-1", code: "SP0001", name: "CV Sinar" },
    ]);

    const formData = new FormData();
    formData.set(
      "file",
      new File(
        ["name,sku,category,price,unit,supplierCode\nAmplop,AMP-SUP,Jasa,1000,pcs,\"sp0001, SP404\""],
        "products.csv",
        { type: "text/csv" },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/products/import/preview", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(supplierFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: { in: ["SP0001", "SP404"] } },
        select: { id: true, code: true, name: true },
      }),
    );
    expect(body.rows[0]).toEqual(
      expect.objectContaining({
        supplierCodes: ["SP0001", "SP404"],
        supplierCodesProvided: true,
      }),
    );
    expect(body.rows[0].warnings).toContain(
      "Kode supplier SP404 tidak ditemukan dan akan diabaikan.",
    );
    expect(body.warnings).toContain(
      "Row 2: Kode supplier SP404 tidak ditemukan dan akan diabaikan.",
    );
  });
});

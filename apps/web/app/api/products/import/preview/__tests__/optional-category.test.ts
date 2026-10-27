import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { importPricingDatabase } from "@/features/product-import/services/__tests__/import-pricing-database";
import type { ColumnMapping } from "@/features/product-import/types";

const boundary = vi.hoisted(() => ({
  db: {},
  requirePermission: vi.fn(),
  handleAuthError: vi.fn(),
}));

vi.mock("@pos/db", () => ({ db: boundary.db, Prisma: {} }));
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: boundary.requirePermission,
  handleAuthError: boundary.handleAuthError,
}));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

import { POST } from "../route";

function fileRequest(format: "csv" | "xlsx", rows: (string | number)[][], columnMapping?: ColumnMapping) {
  let file: File;
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Produk");
    file = new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "produk.xlsx");
  } else {
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    file = new File([csv], "produk.csv", { type: "text/csv" });
  }
  const form = new FormData();
  form.set("file", file);
  if (columnMapping) form.set("columnMapping", JSON.stringify(columnMapping));
  return new Request("http://localhost/api/products/import/preview", { method: "POST", body: form });
}

// Let the parser worker's own deadline report a failure before the test deadline.
describe("category-optional product import through the preview API", { timeout: 15_000 }, () => {
  let database: ReturnType<typeof importPricingDatabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    database = importPricingDatabase();
    Object.assign(boundary.db, database.tx);
    boundary.requirePermission.mockResolvedValue({ id: "owner-1", storeId: "store-main" });
    boundary.handleAuthError.mockReturnValue(null);
  });

  describe.each(["csv", "xlsx"] as const)("%s files", format => {
    it.each([undefined, "", "   "])("defaults a new product when category is %s", async category => {
      const headers = ["name", "sku", "price", "unit"];
      const values: (string | number)[] = ["Produk Baru", "NEW", 1000, "pcs"];
      if (category !== undefined) { headers.push("category"); values.push(category); }
      const response = await POST(fileRequest(format, [headers, values]));
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0]).toMatchObject({ category: "Tanpa Kategori", categoryProvided: false, autoAction: "create", errors: [] });
      expect(database.products).toHaveLength(2);
    });

    it("preserves an existing product category without a category header", async () => {
      const response = await POST(fileRequest(format, [
        ["name", "sku", "price", "costPrice", "unit"],
        ["HVS A4", "HVS-A4-RIM", 60000, 40000, "rim"],
      ]));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.rows[0]).toMatchObject({ category: "ATK", categoryProvided: false, autoAction: "auto_price_update", matchedProductId: "rim", errors: [] });
      expect(Number(database.products[0].price)).toBe(50000);
    });

    it("keeps explicit categories in legacy files", async () => {
      const response = await POST(fileRequest(format, [
        ["name", "sku", "category", "price", "unit"],
        ["Produk Baru", "NEW", "ATK", 1000, "pcs"],
      ]));
      expect(response.status).toBe(200);
      expect((await response.json()).rows[0]).toMatchObject({ category: "ATK", categoryProvided: true, autoAction: "create", errors: [] });
    });

    it("accepts custom mapped headers without mapping a category", async () => {
      const response = await POST(fileRequest(format, [
        ["Barang", "Referensi", "Nominal", "Kemasan"],
        ["Produk Baru", "NEW", 1000, "pcs"],
      ], { Barang: "name", Referensi: "sku", Nominal: "price", Kemasan: "unit" }));
      expect(response.status).toBe(200);
      expect((await response.json()).rows[0]).toMatchObject({ name: "Produk Baru", category: "Tanpa Kategori", errors: [] });
    });

    it("still rejects a file missing the required unit header", async () => {
      const response = await POST(fileRequest(format, [["name", "sku", "price"], ["Produk Baru", "NEW", 1000]]));
      expect(response.status).toBe(422);
      expect((await response.json()).missingColumns).toEqual(["unit"]);
    });
  });

  it("retains category provenance and ambiguity through JSON recalculation", async () => {
    database.tx.category.findMany.mockResolvedValue([{ id: "cat", name: "ATK" }, { id: "paper", name: "Kertas" }]);
    database.products.push({ ...database.products[0], id: "other-rim", sku: "OTHER", categoryId: "paper", category: { name: "Kertas" }, stockGroupId: null });
    const response = await POST(new Request("http://localhost/api/products/import/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [{ rowNumber: 2, name: "HVS A4", sku: "IMPORT-NEW", category: "Tanpa Kategori", categoryProvided: false, price: 60000, costPrice: 40000, unit: "rim" }], decisions: {} }),
    }));
    expect(response.status).toBe(200);
    const row = (await response.json()).rows[0];
    expect(row).toMatchObject({ categoryProvided: false, autoAction: "conflict" });
    expect(row.matchedProductId).toBeUndefined();
  });
});

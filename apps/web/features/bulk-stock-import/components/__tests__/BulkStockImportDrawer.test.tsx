import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BulkStockImportPreviewPanel,
  BulkStockImportProgressPanel,
  BulkStockImportSupplierDropdown,
} from "../BulkStockImportDrawer";

describe("BulkStockImportPreviewPanel", () => {
  it("renders stock import counts and row statuses", () => {
    const html = renderToStaticMarkup(
      <BulkStockImportPreviewPanel
        summary={{
          validRows: 1,
          skippedRows: 1,
          errorRows: 1,
          warningRows: 0,
        }}
        rows={[
          {
            rowNumber: 2,
            name: "Kertas HVS A4",
            category: "ATK",
            unit: "Rim",
            stock: 5,
            beforeStock: 10,
            afterStock: 15,
            productId: "prod-a",
            sku: "SKU-A",
            status: "valid",
            warnings: [],
            errors: [],
          },
          {
            rowNumber: 3,
            name: "Produk Hilang",
            category: "ATK",
            unit: "pcs",
            stock: 2,
            productId: null,
            sku: null,
            status: "skipped",
            warnings: [],
            errors: [],
          },
          {
            rowNumber: 4,
            name: "Produk Rusak",
            category: "ATK",
            unit: "pcs",
            stock: 0,
            productId: null,
            sku: null,
            status: "error",
            warnings: [],
            errors: ["Stock must be a valid number."],
          },
        ]}
      />,
    );

    expect(html).toContain("Valid");
    expect(html).toContain("Skipped");
    expect(html).toContain("Error");
    expect(html).toContain("Kertas HVS A4");
    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain("15");
    expect(html).toContain("Produk Hilang");
    expect(html).toContain("Stock must be a valid number.");
  });

  it("renders filters and candidate selection actions for ambiguous rows", () => {
    const html = renderToStaticMarkup(
      <BulkStockImportPreviewPanel
        summary={{
          validRows: 0,
          skippedRows: 0,
          errorRows: 1,
          warningRows: 0,
        }}
        rows={[
          {
            rowNumber: 2,
            name: "Map Plastik",
            category: "ATK",
            unit: "pcs",
            stock: 4,
            productId: null,
            sku: null,
            status: "error",
            warnings: [],
            errors: ["Matched product is ambiguous."],
            candidates: [
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
            ],
          },
        ]}
      />,
    );

    expect(html).toContain("All 1");
    expect(html).toContain("Warning 0");
    expect(html).toContain("Select product");
    expect(html).toContain("SKU-DUP-1");
    expect(html).toContain("SKU-DUP-2");
  });

  it("renders unchanged set rows as skipped with a note", () => {
    const html = renderToStaticMarkup(
      <BulkStockImportPreviewPanel
        summary={{
          validRows: 0,
          skippedRows: 1,
          errorRows: 0,
          warningRows: 0,
        }}
        rows={[
          {
            rowNumber: 2,
            name: "Kertas HVS A4",
            category: "ATK",
            unit: "Rim",
            stock: 10,
            currentStock: 10,
            productId: "prod-a",
            sku: "SKU-A",
            status: "skipped",
            warnings: [],
            errors: [],
            notes: ["Stock is unchanged."],
          },
        ]}
      />,
    );

    expect(html).toContain("skipped");
    expect(html).toContain("Stock is unchanged.");
  });

  it("renders an optional active supplier dropdown", () => {
    const html = renderToStaticMarkup(
      <BulkStockImportSupplierDropdown
        value="supplier-1"
        onChange={() => undefined}
        suppliers={[
          {
            id: "supplier-1",
            name: "CV Sinar Jaya",
            type: "DISTRIBUTOR",
            phone: null,
            contactPerson: null,
            address: null,
            notes: null,
            isActive: true,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ]}
      />,
    );

    expect(html).toContain("Supplier optional");
    expect(html).toContain("No supplier");
    expect(html).toContain("CV Sinar Jaya - DISTRIBUTOR");
  });

  it("renders commit job progress", () => {
    const html = renderToStaticMarkup(
      <BulkStockImportProgressPanel
        job={{
          id: "job-1",
          status: "RUNNING",
          phase: "UPDATING_STOCK",
          totalRows: 10,
          processedRows: 4,
          successRows: 0,
          failedRows: 0,
          result: null,
          errorMessage: null,
        }}
      />,
    );

    expect(html).toContain("Commit progress");
    expect(html).toContain("Updating stock");
    expect(html).toContain("4 / 10 rows");
    expect(html).toContain("40%");
  });
});

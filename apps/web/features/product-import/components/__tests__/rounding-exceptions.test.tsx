import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportPreviewTable } from "../ProductImportDrawer";
import type { NormalizedImportRow } from "../../types";

const row: NormalizedImportRow = { rowNumber: 2, name: "Kertas contoh", sku: "A4", category: "kertas", unit: "rim", price: 4049,
  hargaAgen: 4050, hargaDinas: 4549, stock: 1, duplicateInFile: false, missingCategory: false, warnings: [], errors: [], autoAction: "create" };
const props = { filteredRows: [row], allRows: [row], decisions: {}, blockersByRow: {}, setDecisions: vi.fn(),
  roundingSettings: { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["paper"] } };

describe("import price preview for excluded categories", () => {
  it("shows all imported prices without rounding using case-insensitive category names", () => {
    const html = renderToStaticMarkup(<ImportPreviewTable {...props} categories={[{ id: "paper", name: "Kertas" }]} />);
    expect(html).toContain("4.049");
    expect(html).toContain("4.050");
    expect(html).toContain("4.549");
    expect(html).not.toContain("Dibulatkan");
  });
  it("does not claim an effective price while existing categories are unavailable", () => {
    const html = renderToStaticMarkup(<ImportPreviewTable {...props} />);
    expect(html).toContain("Kategori belum dapat dimuat");
    expect(html).not.toContain("Harga jual berlaku");
  });
});

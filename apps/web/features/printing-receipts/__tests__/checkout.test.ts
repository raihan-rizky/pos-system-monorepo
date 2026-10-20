import { describe, expect, it } from "vitest";
import { buildPrintingReceiptCartItems } from "../checkout";
import type { PrintingReceiptLine } from "../types";

const empty: PrintingReceiptLine = { id: "empty", name: "", material: "", quantity: null, price: null, stockLink: null };
describe("manual receipt checkout items", () => {
  it("ignores empty template rows and preserves explicit stock consumption", () => {
    expect(buildPrintingReceiptCartItems([empty, { ...empty, id: "ready", name: "Cetak stiker", material: "Vinil", quantity: 2, price: 12500, stockLink: { productId: "vinil", quantity: 1.5, unit: "m" } }])).toEqual([{
      cartLineId: "ready", lineType: "PRINTING_SERVICE", printingServiceId: null, name: "Cetak stiker", material: "Vinil", quantity: 2, price: 12500, unit: "pcs", needsMaterial: true, rawMaterialProductId: "vinil", rawMaterialQuantity: 1.5, rawMaterialUnit: "m",
    }]);
  });
  it("keeps manual rows detached from inventory unless explicitly linked", () => {
    const [item] = buildPrintingReceiptCartItems([{ ...empty, id: "ready", name: "Desain", quantity: 1, price: 0 }]);
    expect(item).toMatchObject({ printingServiceId: null, needsMaterial: false, rawMaterialProductId: null, rawMaterialQuantity: null, rawMaterialUnit: null });
  });
  it("blocks a blank receipt and identifies a partially filled row", () => {
    expect(() => buildPrintingReceiptCartItems([empty])).toThrow("Isi minimal satu baris");
    expect(() => buildPrintingReceiptCartItems([empty, { ...empty, id: "partial", name: "Cetak" }])).toThrow("baris 2");
    expect(() => buildPrintingReceiptCartItems([{ ...empty, name: "Cetak", quantity: 1.5, price: 100 }])).toThrow("bilangan bulat");
  });
});

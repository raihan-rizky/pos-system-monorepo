import { describe, expect, it } from "vitest";
import {
  buildNotaPenawaranDraftInput,
  canViewQuotationHpp,
  getCartCheckoutMode,
  updateQuoteLine,
} from "../quotation-rules";
import type { QuotationProductLine } from "../quotation-rules";

const productLine = (
  overrides: Partial<QuotationProductLine> = {},
): QuotationProductLine => ({
  cartLineId: "PRODUCT:p1::",
  lineType: "PRODUCT" as const,
  productId: "p1",
  name: "Kertas A4",
  price: 50000,
  quantity: 1,
  unit: "rim",
  stock: 10,
  ...overrides,
});

describe("getCartCheckoutMode", () => {
  it("uses payment mode even when a product line has empty or negative stock", () => {
    expect(
      getCartCheckoutMode([
        productLine({ stock: 10 }),
        productLine({ productId: "p2", stock: 0 }),
        productLine({ productId: "p3", stock: -5 }),
      ]),
    ).toBe("payment");
  });

  it("keeps payment mode when every product line has stock", () => {
    expect(getCartCheckoutMode([productLine({ stock: 1 })])).toBe("payment");
  });
});

describe("canViewQuotationHpp", () => {
  it("allows owner, admin, and cashier to see HPP but hides it from sales", () => {
    expect(canViewQuotationHpp("OWNER")).toBe(true);
    expect(canViewQuotationHpp("ADMIN")).toBe(true);
    expect(canViewQuotationHpp("CASHIER")).toBe(true);
    expect(canViewQuotationHpp("SALES")).toBe(false);
  });
});

describe("updateQuoteLine", () => {
  it("edits the document name while preserving the POS identity and cart line", () => {
    const original = productLine();
    const renamed = updateQuoteLine(original, { documentName: "Kertas untuk rapat" });
    const repriced = updateQuoteLine(renamed, { quantity: 3, price: 47500 });
    expect(repriced).toMatchObject({
      cartLineId: "PRODUCT:p1::", productId: "p1", name: "Kertas A4",
      documentName: "Kertas untuk rapat", quantity: 3, price: 47500,
    });
    expect(original).not.toHaveProperty("documentName");
    expect(updateQuoteLine(repriced, { documentName: null })).toMatchObject({
      name: "Kertas A4", documentName: null, quantity: 3, price: 47500,
    });
  });

  it("allows quantity to exceed the current stock snapshot", () => {
    const updated = updateQuoteLine(productLine({ stock: 0 }), {
      quantity: 5,
    });

    expect(updated.quantity).toBe(5);
  });
});

describe("buildNotaPenawaranDraftInput", () => {
  it("submits a trimmed document name separately from the original POS name", () => {
    const input = buildNotaPenawaranDraftInput({
      kepadaYth: "PT Contoh",
      lines: [productLine({ documentName: "  Kertas untuk rapat  " }), productLine()],
    });
    expect(input.items).toEqual([
      expect.objectContaining({ productId: "p1", name: "Kertas A4", documentName: "Kertas untuk rapat" }),
      expect.objectContaining({ productId: "p1", name: "Kertas A4", documentName: null }),
    ]);
  });

  it.each(["", "   ", "A".repeat(301)])("rejects invalid document name %j before saving", (documentName) => {
    expect(() => buildNotaPenawaranDraftInput({
      kepadaYth: "PT Contoh", lines: [productLine({ documentName })],
    })).toThrow(/Nama pada nota/);
  });

  it("requires Kepada Yth before creating nota penawaran", () => {
    expect(() =>
      buildNotaPenawaranDraftInput({
        kepadaYth: " ",
        note: "",
        lines: [productLine()],
      }),
    ).toThrow(/Kepada Yth/i);
  });

  it("maps edited quote quantity and price into draft item input", () => {
    const input = buildNotaPenawaranDraftInput({
      kepadaYth: "PT Contoh",
      note: "Harga proyek",
      lines: [
        updateQuoteLine(productLine({ stock: 0 }), {
          quantity: 4,
          price: 47500,
        }),
      ],
    });

    expect(input.customerName).toBe("PT Contoh");
    expect(input.note).toBe("Harga proyek");
    expect(input.isJobOrder).toBe(false);
    expect(input.items).toEqual([
      expect.objectContaining({
        productId: "p1",
        name: "Kertas A4",
        price: 47500,
        quantity: 4,
      }),
    ]);
  });
});

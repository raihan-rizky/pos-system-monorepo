import { describe, expect, it } from "vitest";
import {
  createEmptyPrintingReceiptDocument,
  getPrintingReceiptCheckoutLines,
  getPrintingReceiptTotal,
  parsePrintingReceiptDocument,
  parsePrintingReceiptNumber,
  PrintingReceiptValidationError,
} from "../domain";

const line = (overrides: Record<string, unknown> = {}) => ({
  id: "line-1", name: "Undangan bebas", material: "Kertas pilihan pelanggan",
  quantity: 2, price: 1250.25, stockLink: null, ...overrides,
});
const document = (lines: unknown[] = []) => ({
  customerName: "", customerPhone: "", customerId: null, date: "2026-10-20",
  note: "", completionDate: "", completionTime: "", receiver: "", setter: "",
  signatory: "", lines,
});

describe("printing receipt document domain", () => {
  it("creates an empty persistent draft with a Jakarta date", () => {
    const draft = createEmptyPrintingReceiptDocument(new Date("2026-10-19T18:00:00Z"));
    expect(draft).toEqual(document());
    expect(parsePrintingReceiptDocument(draft)).toEqual(draft);
  });

  it("keeps free text without a catalog ID and derives money in cents", () => {
    const draft = parsePrintingReceiptDocument(document([line()]));
    expect(getPrintingReceiptCheckoutLines(draft)).toEqual([line()]);
    expect(getPrintingReceiptTotal(draft)).toBe(2500.5);
  });

  it("allows blank draft fields and skips wholly blank rows at checkout", () => {
    const blank = line({ id: "blank", name: "", material: "", quantity: null, price: null });
    const draft = parsePrintingReceiptDocument(document([blank, line()]));
    expect(draft.lines).toHaveLength(2);
    expect(getPrintingReceiptCheckoutLines(draft)).toEqual([line()]);
    expect(getPrintingReceiptTotal(draft)).toBe(2500.5);
  });

  it("rejects empty and partially filled documents at checkout", () => {
    expect(() => getPrintingReceiptCheckoutLines(parsePrintingReceiptDocument(document())))
      .toThrow(PrintingReceiptValidationError);
    for (const partial of [line({ name: "" }), line({ quantity: null }), line({ price: null }),
      line({ name: "", material: "Vinil", quantity: null, price: null })]) {
      expect(() => getPrintingReceiptCheckoutLines(parsePrintingReceiptDocument(document([partial]))))
        .toThrow(PrintingReceiptValidationError);
    }
  });

  it.each([-1, Infinity, NaN, 0.001, 10_000_000_000])("rejects invalid price %s", price => {
    expect(() => parsePrintingReceiptDocument(document([line({ price })])))
      .toThrow(PrintingReceiptValidationError);
  });

  it.each([-1, 0, 1.5, Infinity, 2_147_483_648])("rejects invalid quantity %s", quantity => {
    expect(() => parsePrintingReceiptDocument(document([line({ quantity })])))
      .toThrow(PrintingReceiptValidationError);
  });

  it("rejects unsafe line totals and document totals", () => {
    expect(() => parsePrintingReceiptDocument(document([line({ quantity: 2, price: 9_999_999_999.99 })])))
      .toThrow(PrintingReceiptValidationError);
    expect(() => parsePrintingReceiptDocument(document([
      line({ price: 4_000_000_000 }), line({ id: "second", price: 4_000_000_000 }),
    ]))).toThrow(PrintingReceiptValidationError);
  });

  it("validates stock consumption independently from sale quantity", () => {
    const stockLink = { productId: "material-1", quantity: 0.5, unit: "m" };
    const draft = parsePrintingReceiptDocument(document([line({ stockLink })]));
    expect(draft.lines[0].stockLink).toEqual(stockLink);
    for (const bad of [{ ...stockLink, quantity: -1 }, { ...stockLink, quantity: Infinity },
      { ...stockLink, unit: "" }, { ...stockLink, productId: "" }]) {
      expect(() => parsePrintingReceiptDocument(document([line({ stockLink: bad })])))
        .toThrow(PrintingReceiptValidationError);
    }
  });

  it("bounds text and row count and rejects duplicate row IDs", () => {
    expect(() => parsePrintingReceiptDocument({ ...document(), note: "x".repeat(5001) }))
      .toThrow(PrintingReceiptValidationError);
    expect(() => parsePrintingReceiptDocument(document([line(), line()])))
      .toThrow(PrintingReceiptValidationError);
    expect(() => parsePrintingReceiptDocument(document(Array.from({ length: 201 }, (_, i) => line({ id: String(i) })))))
      .toThrow(PrintingReceiptValidationError);
  });

  it("requires real calendar dates and valid completion times", () => {
    for (const bad of [{ date: "2026-02-30" }, { completionDate: "2026-13-01" }, { completionTime: "25:00" }]) {
      expect(() => parsePrintingReceiptDocument({ ...document(), ...bad }))
        .toThrow(PrintingReceiptValidationError);
    }
  });

  it("allows custom numbers while protecting generated transaction prefixes", () => {
    expect(parsePrintingReceiptNumber("  SP/20/10/26-A  ")).toBe("SP/20/10/26-A");
    for (const number of ["", "INV-20261020-0001", "inv-custom", "PNWTLD123", "PNW-TLD-20261020-001", "a\nb", "x".repeat(81)]) {
      expect(() => parsePrintingReceiptNumber(number)).toThrow(PrintingReceiptValidationError);
    }
  });

  it("explains out-of-range numeric values in Indonesian", () => {
    expect(() => parsePrintingReceiptDocument(document([line({ price: 10_000_000_000 })])))
      .toThrow("Isian nota belum valid.");
  });
});

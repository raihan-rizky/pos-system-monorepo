import { describe, expect, it } from "vitest";
import { buildNotaPenawaranDraftInput, updateQuoteLine } from "../quotation-rules";
import type { QuotationProductLine } from "../quotation-rules";

function line(overrides: Partial<QuotationProductLine> = {}): QuotationProductLine {
  return {
    cartLineId: "PRODUCT:amplop-110:box",
    lineType: "PRODUCT",
    productId: "amplop-110",
    name: "Amplop 110 PPL",
    price: 25000,
    quantity: 2,
    unit: "dus",
    stock: 8,
    unitMultiplierToBase: 100,
    stockGroup: { baseUnit: "lembar" },
    size: "110",
    material: "Putih",
    ...overrides,
  };
}

function draft(lines: QuotationProductLine[]) {
  return buildNotaPenawaranDraftInput({ kepadaYth: "PT Contoh", lines });
}

describe("quotation document name boundaries", () => {
  it.each([
    ["one character", "A", "A"],
    ["300 characters", "A".repeat(300), "A".repeat(300)],
    ["300 characters surrounded by whitespace", ` \t${"A".repeat(300)}\n `, "A".repeat(300)],
    ["supplier punctuation and Unicode", "Amplop Putih – Café / 110 (包)", "Amplop Putih – Café / 110 (包)"],
    ["literal markup", '<b>Amplop & \"Putih\"</b>', '<b>Amplop & \"Putih\"</b>'],
  ])("preserves %s as a separate alias", (_description, documentName, expectedName) => {
    const result = draft([line({ documentName })]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      productId: "amplop-110", name: "Amplop 110 PPL", documentName: expectedName,
      quantity: 2, price: 25000, size: "110", material: "Putih",
    });
  });

  it.each(["\t\n", "\u00a0\u2003", ` ${"A".repeat(301)} `])(
    "rejects whitespace or an overlong alias %j", documentName => {
      expect(() => draft([line({ documentName })])).toThrow(/Nama pada nota/);
    },
  );

  it.each([undefined, null])("supports old lines without an alias (%s)", documentName => {
    expect(draft([line({ documentName })]).items[0]).toMatchObject({
      productId: "amplop-110", name: "Amplop 110 PPL", documentName: null,
    });
  });
});

describe("quotation document names remain scoped to each cart line", () => {
  it("edits one of two lines for the same product without mutating cart data", () => {
    const first = Object.freeze(line());
    const second = Object.freeze(line({ cartLineId: "PRODUCT:amplop-110:piece", unit: "lembar", price: 250, quantity: 20 }));
    const edited = updateQuoteLine(first, { documentName: "Amplop Putih No. 110" });
    const result = draft([edited, second]);

    expect(result.items).toEqual([
      expect.objectContaining({ productId: "amplop-110", name: "Amplop 110 PPL", documentName: "Amplop Putih No. 110", price: 25000, quantity: 2 }),
      expect.objectContaining({ productId: "amplop-110", name: "Amplop 110 PPL", documentName: null, price: 250, quantity: 20 }),
    ]);
    expect(first).not.toHaveProperty("documentName");
    expect(second).not.toHaveProperty("documentName");
    expect(edited).toMatchObject({ unitMultiplierToBase: 100, stock: 8, stockGroup: { baseUnit: "lembar" } });
  });

  it("rejects an invalid later line without mutating earlier valid aliases", () => {
    const first = Object.freeze(line({ documentName: "  Amplop untuk rapat  " }));
    const invalid = Object.freeze(line({ cartLineId: "another-line", documentName: "  " }));
    expect(() => draft([first, invalid])).toThrow(/Nama pada nota/);
    expect(first.documentName).toBe("  Amplop untuk rapat  ");
    expect(invalid.documentName).toBe("  ");
  });

  it("serializes a reset alias independently from another edited line", () => {
    const first = line({ documentName: "Untuk rapat" });
    const second = line({ cartLineId: "another-line", documentName: "Untuk arsip" });
    const result = draft([updateQuoteLine(first, { documentName: null }), second]);
    expect(result.items.map(item => item.documentName)).toEqual([null, "Untuk arsip"]);
    expect([first.documentName, second.documentName]).toEqual(["Untuk rapat", "Untuk arsip"]);
  });
});

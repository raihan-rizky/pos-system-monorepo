import { describe, expect, it } from "vitest";
import { buildInternalUseRecap } from "../internal-use-recap";

const paper = { id: "paper", name: "Kertas", sku: "K", unit: "rim" };
const labels = { id: "labels", name: "Label", sku: "L", unit: "pak" };
const source = {
  id: "stock-out", productId: paper.id, product: paper, quantity: 10, unitCost: 12000,
  note: "Alasan awal", person: "Rina", createdAt: new Date("2026-11-28T02:00:00.000Z"),
};
const replacement = {
  id: "replacement", status: "APPROVED" as const, correctedProductId: labels.id,
  correctedQuantity: 4, correctedProduct: labels, correctedNote: "Produk awal keliru",
  correctedReason: "USAGE" as const, movements: [{ inventoryLog: { unitCost: 23000 } }],
};

describe("internal usage recap with corrections", () => {
  it("uses the effective quantity, product, and original replacement cost after multiple revisions", () => {
    const row = {
      ...source,
      correctionRequests: [
        { ...replacement, id: "second-correction", correctedQuantity: 3, movements: [] },
        replacement,
      ],
    };
    const recap = buildInternalUseRecap({ period: "weekly", anchorDate: "2026-11-28", rows: [row] });

    expect(recap.summary).toMatchObject({ entryCount: 1, totalQuantity: 3, totalValue: 69000 });
    expect(recap.entries[0]).toMatchObject({
      productId: "labels", productName: "Label", unitCost: 23000, note: "Produk awal keliru",
    });
  });

  it("omits a fully cancelled entry from totals and entries", () => {
    const row = { ...source, correctionRequests: [{ ...replacement, correctedQuantity: 0 }] };
    const recap = buildInternalUseRecap({ period: "weekly", anchorDate: "2026-11-28", rows: [row] });

    expect(recap.summary).toMatchObject({ entryCount: 0, totalQuantity: 0, totalValue: 0 });
    expect(recap.entries).toEqual([]);
  });
});

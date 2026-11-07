import { describe, expect, it } from "vitest";
import { planCorrectionReceiptChanges } from "../shopping-request-correction-lines";
import type { CorrectionLine } from "../../types/shopping-request-correction";

const original = [{
  requestItemId: "request-item", purchaseItemId: "purchase-item", productId: "product-a",
  receipts: [{ receiptLineId: "first", receivedQty: 7 }, { receiptLineId: "second", receivedQty: 2 }],
}];
const line = (overrides: Partial<CorrectionLine> = {}): CorrectionLine => ({
  clientLineKey: "row-a", requestItemId: "request-item", purchaseItemId: "purchase-item",
  productId: "product-a", unit: "pcs", requestedQty: 10, approvedQty: 10, orderedQty: 10,
  unitPrice: "1000.00", receipts: [{ receiptLineId: "first", receivedQty: 5 }, { receiptLineId: "second", receivedQty: 2 }],
  ...overrides,
});

describe("rencana penerimaan koreksi", () => {
  it("mengoreksi penerimaan yang dipilih tanpa mengubah penerimaan lainnya", () => {
    expect(planCorrectionReceiptChanges(original, [line()])).toEqual({
      existing: [{ requestItemId: "request-item", purchaseItemId: "purchase-item", productId: "product-a", receiptLineId: "first", oldReceivedQty: 7, newReceivedQty: 5 }],
      added: [],
    });
  });

  it("mengurangi semua penerimaan barang yang dihapus dan mencatat barang baru secara terpisah", () => {
    expect(planCorrectionReceiptChanges(original, [line({ clientLineKey: "row-b", requestItemId: null, purchaseItemId: null, productId: "product-b", receipts: [{ receiptLineId: null, receivedQty: 3 }] })])).toEqual({
      existing: [
        { requestItemId: "request-item", purchaseItemId: "purchase-item", productId: "product-a", receiptLineId: "first", oldReceivedQty: 7, newReceivedQty: 0 },
        { requestItemId: "request-item", purchaseItemId: "purchase-item", productId: "product-a", receiptLineId: "second", oldReceivedQty: 2, newReceivedQty: 0 },
      ],
      added: [{ clientLineKey: "row-b", productId: "product-b", receivedQty: 3 }],
    });
  });

  it("menolak sumber yang hilang atau tidak termasuk barang semula", () => {
    expect(() => planCorrectionReceiptChanges(original, [line({ receipts: [{ receiptLineId: "first", receivedQty: 5 }] })])).toThrow(/penerimaan/i);
    expect(() => planCorrectionReceiptChanges(original, [line({ receipts: [{ receiptLineId: "first", receivedQty: 5 }, { receiptLineId: "other", receivedQty: 2 }] })])).toThrow(/penerimaan/i);
    expect(() => planCorrectionReceiptChanges(original, [line({ productId: "product-b" })])).toThrow(/barang/i);
    expect(() => planCorrectionReceiptChanges(original, [line({ purchaseItemId: "other" })])).toThrow(/barang/i);
  });

  it("mengubah penerimaan baru yang pernah dicatat tanpa menggandakan stok", () => {
    const withAdded = [{ ...original[0], receipts: [...original[0].receipts, { receiptLineId: null, receivedQty: 1 }] }];
    expect(planCorrectionReceiptChanges(withAdded, [line({ receipts: [{ receiptLineId: "first", receivedQty: 7 }, { receiptLineId: "second", receivedQty: 2 }, { receiptLineId: null, receivedQty: 0 }] })]).existing)
      .toEqual([{ requestItemId: "request-item", purchaseItemId: "purchase-item", productId: "product-a", receiptLineId: null, oldReceivedQty: 1, newReceivedQty: 0 }]);
  });
});

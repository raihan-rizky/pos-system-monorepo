import { describe, expect, it } from "vitest";
import { effectiveReceivedQuantities as effective } from "../shopping-request-correction";

describe("jumlah penerimaan efektif", () => {
  it("menggabungkan penerimaan bertahap, koreksi berulang, dan barang baru", () => {
    expect(effective([
      { receiptLineId: "line-1", purchaseItemId: "a", receivedQty: 10 },
      { receiptLineId: "line-2", purchaseItemId: "a", receivedQty: 3 },
    ], [
      { receiptLineId: "line-1", purchaseItemId: "a", oldReceivedQty: 10, newReceivedQty: 7 },
      { receiptLineId: "line-1", purchaseItemId: "a", oldReceivedQty: 7, newReceivedQty: 8 },
      { receiptLineId: null, purchaseItemId: "b", oldReceivedQty: 0, newReceivedQty: 2 },
    ])).toEqual([{ purchaseItemId: "a", receivedQty: 11 }, { purchaseItemId: "b", receivedQty: 2 }]);
  });

  it("mempertahankan presisi pecahan dalam penjumlahan", () => {
    expect(effective([
      { receiptLineId: "one", purchaseItemId: "a", receivedQty: 0.1 },
      { receiptLineId: "two", purchaseItemId: "a", receivedQty: 0.2 },
    ], [])).toEqual([{ purchaseItemId: "a", receivedQty: 0.3 }]);
  });

  it("menolak sumber ganda, item berbeda, dan hasil penerimaan negatif", () => {
    const receipt = { receiptLineId: "line", purchaseItemId: "a", receivedQty: 2 };
    expect(() => effective([receipt, receipt], [])).toThrow(/sumber|ganda/i);
    expect(() => effective([receipt], [{ receiptLineId: "line", purchaseItemId: "b", oldReceivedQty: 2, newReceivedQty: 1 }])).toThrow(/sumber|barang/i);
    expect(() => effective([receipt], [{ receiptLineId: "line", purchaseItemId: "a", oldReceivedQty: 5, newReceivedQty: 1 }])).toThrow(/penerimaan/i);
  });
});

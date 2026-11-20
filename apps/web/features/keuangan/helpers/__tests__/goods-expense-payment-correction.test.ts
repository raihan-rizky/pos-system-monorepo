import { describe, expect, it } from "vitest";
import type { ShoppingRequestCorrectionEditor } from "@/features/suppliers/shopping-requests/repositories/shopping-request-correction-editor";
import { buildGoodsExpensePaymentCorrection } from "../goods-expense-payment-correction";

const editor: ShoppingRequestCorrectionEditor = {
  requestId: "request-1", purchaseId: "purchase-1", totalAmount: "1000.00", version: "a".repeat(64),
  header: { name: "Daftar", number: "DP-1", businessDate: "2026-11-01", supplierId: "supplier-1", requestedByName: null, note: null },
  items: [{
    clientLineKey: "item-1", requestItemId: "request-item", purchaseItemId: "purchase-item",
    productId: "product-1", productName: "Kertas", sku: "KRT", unit: "rim",
    requestedQty: 1, approvedQty: 1, orderedQty: 1, unitPrice: "1000.00",
    receipts: [], catalogCostPrice: "1000.00", catalogSalePrice: "1200.00", catalogUpdatedAt: "2026-11-01T00:00:00.000Z",
  }],
  payment: {
    method: "GIRO", dueDate: "2026-11-25",
    sources: [
      { paymentId: "earlier", sourceKind: "PAYABLE_PAYMENT", paidAt: "2026-11-05", amount: "200.00" },
      { paymentId: "selected", sourceKind: "PAYABLE_PAYMENT", paidAt: "2026-11-08", amount: "350.00" },
    ],
    allocations: [
      { paymentId: "earlier", sourceKind: "PAYABLE_PAYMENT", method: "GIRO", amount: "200.00" },
      { paymentId: "selected", sourceKind: "PAYABLE_PAYMENT", method: "GIRO", amount: "250.00" },
      { paymentId: "selected", sourceKind: "PAYABLE_PAYMENT", method: "TRANSFER", amount: "100.00" },
    ],
  },
  pendingReceipts: [],
};
const subject = { kind: "SUPPLIER_PAYABLE_PAYMENT" as const, id: "selected" };
const key = "43c10dcf-8281-4fa0-8cfb-64e835ae9051";

describe("koreksi pembayaran Pembelian Barang", () => {
  it("mengoreksi satu pembayaran dan mempertahankan alokasi termin lainnya", () => {
    const draft = buildGoodsExpensePaymentCorrection({
      editor, payment: subject, operation: "edit", changes: { amountCents: 20_000, paidAt: "2026-11-09" },
      reason: "Perbaiki nominal dan tanggal", key, today: "2026-11-20",
    });
    expect(draft).toMatchObject({
      expectedVersion: editor.version,
      idempotencyKey: key,
      header: editor.header,
      items: [{ purchaseItemId: "purchase-item", orderedQty: 1 }],
      payment: {
        corrections: [{ paymentId: "selected", sourceKind: "PAYABLE_PAYMENT", amount: "200.00", paidAt: "2026-11-09" }],
        allocations: [editor.payment.allocations[0],
          { paymentId: "selected", method: "GIRO", amount: "142.86" },
          { paymentId: "selected", method: "TRANSFER", amount: "57.14" },
        ],
      },
    });
  });

  it("mengeluarkan satu pembayaran dari alokasi aktif saat dibatalkan", () => {
    const draft = buildGoodsExpensePaymentCorrection({
      editor, payment: subject, operation: "cancel", reason: "Batalkan pembayaran", key, today: "2026-11-20",
    });
    expect(draft.payment).toMatchObject({
      allocations: [editor.payment.allocations[0]],
      corrections: [{ paymentId: "selected", amount: "0.00", paidAt: "2026-11-08" }],
    });
  });

  it("menolak pembayaran yang tidak termasuk dokumen dan tanggal mendatang", () => {
    for (const [payment, paidAt] of [[{ ...subject, id: "other" }, "2026-11-09"], [subject, "2026-11-21"]] as const) {
      expect(() => buildGoodsExpensePaymentCorrection({
        editor, payment, operation: "edit", changes: { paidAt },
        reason: "Koreksi pembayaran", key, today: "2026-11-20",
      })).toThrow();
    }
  });
});

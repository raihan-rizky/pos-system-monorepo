import { describe, expect, it } from "vitest";
import { parseShoppingRequestCorrection } from "../shopping-request-correction-input";
import type { ShoppingRequestCorrectionInput } from "../../types/shopping-request-correction";

function input(): ShoppingRequestCorrectionInput {
  return {
    idempotencyKey: "permintaan-uji-1", expectedVersion: "versi-1", reason: "Salah jumlah",
    header: { name: "Daftar kertas", number: "DPB-001", businessDate: "2026-11-06", supplierId: "supplier-1", requestedByName: null, note: null },
    items: [{ clientLineKey: "baris-1", requestItemId: "request-item-1", purchaseItemId: "purchase-item-1", productId: "produk-1", unit: "lembar", requestedQty: 10, approvedQty: 10, orderedQty: 10, unitPrice: "95000.00", receipts: [{ receiptLineId: "penerimaan-1", receivedQty: 7 }] }],
    payment: { method: "GIRO", dueDate: "2026-12-06", allocations: [{ paymentId: "bayar-1", sourceKind: "PAYABLE_PAYMENT", method: "GIRO", amount: "100000.00" }], corrections: [] },
    catalog: [],
  };
}

describe("validasi koreksi daftar belanja", () => {
  it("mempertahankan rincian jadwal campuran dan beberapa Giro", () => {
    const data = input();
    const schedule = [
      { method: "TRANSFER", amount: "200000.00", dueDate: null, note: "DP" },
      { method: "GIRO", amount: "200000.00", dueDate: "2026-12-01", note: "Tahap 1" },
      { method: "GIRO", amount: "265000.00", dueDate: "2026-12-15", note: "Tahap 2" },
    ];
    expect(parseShoppingRequestCorrection({ ...data, payment: { ...data.payment, schedule } }).payment).toHaveProperty("schedule", schedule);
  });
  it("menerima jumlah kebutuhan, pesanan, dan penerimaan yang berbeda", () => {
    const parsed = parseShoppingRequestCorrection(input());
    expect(parsed.items[0]).toMatchObject({ requestedQty: 10, approvedQty: 10, orderedQty: 10, receipts: [{ receivedQty: 7 }] });
  });

  it("menolak tanggal yang tidak ada dan nominal pecahan yang melebihi dua tempat", () => {
    const invalidDate = input();
    invalidDate.header.businessDate = "2026-02-30";
    expect(() => parseShoppingRequestCorrection(invalidDate)).toThrow();
    const invalidPrice = input();
    invalidPrice.items[0].unitPrice = "1.001";
    expect(() => parseShoppingRequestCorrection(invalidPrice)).toThrow();
  });

  it("menolak jumlah tidak sah dan penerimaan yang melebihi pesanan", () => {
    const invalid = input();
    invalid.items[0].receipts[0].receivedQty = 11;
    expect(() => parseShoppingRequestCorrection(invalid)).toThrow();
    invalid.items[0].receipts[0].receivedQty = Number.NaN;
    expect(() => parseShoppingRequestCorrection(invalid)).toThrow();
  });

  it("menolak produk, penerimaan, dan alokasi pembayaran yang diduplikasi", () => {
    const duplicateItem = input();
    duplicateItem.items.push({ ...duplicateItem.items[0], clientLineKey: "baris-2" });
    expect(() => parseShoppingRequestCorrection(duplicateItem)).toThrow();
    const duplicateReceipt = input();
    duplicateReceipt.items[0].receipts.push({ receiptLineId: "penerimaan-1", receivedQty: 1 });
    expect(() => parseShoppingRequestCorrection(duplicateReceipt)).toThrow();
    const duplicatePayment = input();
    duplicatePayment.payment.allocations.push({ paymentId: "bayar-1", sourceKind: "PAYABLE_PAYMENT", method: "GIRO", amount: "1.00" });
    expect(() => parseShoppingRequestCorrection(duplicatePayment)).toThrow();
  });

  it("menerima satu pembayaran yang dialokasikan ke Transfer dan Giro", () => {
    const split = input();
    split.payment.allocations.push({ paymentId: "bayar-1", sourceKind: "PAYABLE_PAYMENT", method: "TRANSFER", amount: "50000.00" });
    expect(parseShoppingRequestCorrection(split).payment.allocations).toHaveLength(2);
  });

  it("memerlukan alasan untuk koreksi yang sudah diproses", () => {
    const missingReason = input();
    missingReason.reason = "  ";
    expect(() => parseShoppingRequestCorrection(missingReason)).toThrow();
  });
});

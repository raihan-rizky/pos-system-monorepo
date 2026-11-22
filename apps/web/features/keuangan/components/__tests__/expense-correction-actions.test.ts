import { describe, expect, it } from "vitest";
import { getExpenseCorrectionActions } from "../../helpers/expense-correction-actions";

describe("menu koreksi pengeluaran otomatis", () => {
  it("memisahkan tindakan pembayaran dari pembelian, termasuk pada baris transfer", () => {
    expect(getExpenseCorrectionActions({
      source: { type: "GOODS_PURCHASE", id: "purchase-1", number: "PB-1" },
      paymentSource: { kind: "GOODS_INITIAL_TRANSFER", id: "purchase-1" },
    }, () => true)).toMatchObject([
      { label: "Ubah pembayaran", subject: { id: "purchase-1", payment: { kind: "GOODS_INITIAL_TRANSFER" } } },
      { label: "Batalkan pembayaran", subject: { id: "purchase-1", payment: { kind: "GOODS_INITIAL_TRANSFER" } } },
      { label: "Ubah pembelian", subject: { id: "purchase-1" } },
      { label: "Batalkan pembelian", subject: { id: "purchase-1" } },
    ]);
  });

  it("memerlukan izin pengeluaran dan izin sumber tanpa memberi hak untuk pembelian induk", () => {
    const item = {
      source: { type: "BACKDATED_PURCHASE", id: "purchase-1", number: "BT-1" },
      paymentSource: { kind: "BACKDATED_PAYMENT", id: "payment-1" },
    } as const;
    expect(getExpenseCorrectionActions(item, (resource, action) => action === "update" &&
      ["expense", "supplier.backdated_payment.correction"].includes(resource))).toMatchObject([
      { label: "Ubah pembayaran", subject: { id: "purchase-1", payment: { id: "payment-1" } } },
    ]);
    expect(getExpenseCorrectionActions(item, resource => resource === "expense")).toEqual([]);
  });

  it("menyediakan aksi daftar lama dan menyerahkan baris manual ke alur yang sudah ada", () => {
    expect(getExpenseCorrectionActions({ source: { type: "SHOPPING_REQUEST", id: "request-1", number: "DPB-1" } }, () => true))
      .toMatchObject([{ label: "Ubah daftar belanja" }, { label: "Batalkan daftar belanja" }]);
    for (const type of ["MANUAL", "MANUAL_TRANSFER_PURCHASE"] as const) {
      expect(getExpenseCorrectionActions({ source: { type } }, () => true)).toEqual([]);
    }
  });

  it("tidak menjadikan pelunasan hutang manual sebagai pembelian yang bisa dikoreksi", () => {
    expect(getExpenseCorrectionActions({ source: { type: "MANUAL_PAYABLE" } }, () => true)).toEqual([]);
  });
});

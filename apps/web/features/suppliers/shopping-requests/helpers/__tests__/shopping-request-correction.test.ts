import { describe, expect, it } from "vitest";
import {
  calculateCorrectionTotal,
  planCorrectionStock,
  summarizeCorrectionPayment,
} from "../shopping-request-correction";

describe("perhitungan koreksi daftar belanja", () => {
  it("menghitung nilai dari jumlah yang diterima, termasuk pecahan dan beberapa penerimaan", () => {
    expect(calculateCorrectionTotal([{ receivedQty: 7, unitPrice: "95000.00" }])).toBe("665000.00");
    expect(calculateCorrectionTotal([
      { receivedQty: 0, unitPrice: "95000.00" },
      { receivedQty: 0.25, unitPrice: "12.40" },
      { receivedQty: 2, unitPrice: "0.10" },
    ])).toBe("3.30");
  });

  it("menolak jumlah diterima atau harga yang tidak sah", () => {
    for (const line of [
      { receivedQty: -1, unitPrice: "10.00" },
      { receivedQty: Number.NaN, unitPrice: "10.00" },
      { receivedQty: 1, unitPrice: "-1.00" },
      { receivedQty: 1, unitPrice: "1.001" },
    ]) {
      expect(() => calculateCorrectionTotal([line])).toThrow();
    }
  });

  it("merencanakan selisih stok berdasarkan penerimaan, termasuk barang baru", () => {
    expect(planCorrectionStock([
      { productId: "a", stockGroupId: null, oldQty: 10, newQty: 7, baseMultiplier: 1, availableBaseStock: 5 },
      { productId: "b", stockGroupId: null, oldQty: 0, newQty: 2, baseMultiplier: 1, availableBaseStock: 0 },
    ])).toEqual([
      { productId: "a", stockGroupId: null, baseDelta: -3 },
      { productId: "b", stockGroupId: null, baseDelta: 2 },
    ]);
  });

  it("menjumlahkan varian dalam grup sekali pada satuan dasar", () => {
    expect(planCorrectionStock([
      { productId: "box", stockGroupId: "g", oldQty: 2, newQty: 1, baseMultiplier: 10, availableBaseStock: 8 },
      { productId: "piece", stockGroupId: "g", oldQty: 0, newQty: 4, baseMultiplier: 1, availableBaseStock: 8 },
    ])).toEqual([{ productId: "box", stockGroupId: "g", baseDelta: -6 }]);
  });

  it("menolak stok tidak cukup dan konversi yang tidak pasti", () => {
    const line = { productId: "a", stockGroupId: "g", oldQty: 10, newQty: 7, baseMultiplier: 1, availableBaseStock: 2 };
    expect(() => planCorrectionStock([line])).toThrow(/stok/i);
    expect(() => planCorrectionStock([{ ...line, baseMultiplier: 0 }])).toThrow(/konversi/i);
  });

  it("menampilkan kelebihan pembayaran tanpa membuat sisa utang negatif", () => {
    expect(summarizeCorrectionPayment("700000.00", "1000000.00")).toEqual({ remaining: "0.00", overpaid: "300000.00" });
    expect(summarizeCorrectionPayment("700000.00", "200000.00")).toEqual({ remaining: "500000.00", overpaid: "0.00" });
  });
});

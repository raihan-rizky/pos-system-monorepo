import { describe, expect, it } from "vitest";
import { parseComparisonAmounts, snapshotPaymentMethods } from "../daily-comparison";

describe("perbandingan penerimaan harian", () => {
  it("mempertahankan nol dan menormalkan pecahan tanpa menambahkan metode yang kosong", () => {
    expect(parseComparisonAmounts([{ method: "CASH", amount: "0" }, { method: "TRANSFER", amount: "00100.1" }])).toEqual([
      { method: "CASH", amount: "0.00" }, { method: "TRANSFER", amount: "100.10" },
    ]);
    expect(parseComparisonAmounts([])).toEqual([]);
  });

  it("menolak nominal negatif, terlalu besar, presisi berlebih, metode tidak dikenal dan duplikat", () => {
    for (const rows of [
      [{ method: "CASH", amount: "-1" }],
      [{ method: "CASH", amount: "10000000000" }],
      [{ method: "CASH", amount: "1.001" }],
      [{ method: "CASH", amount: "" }],
      [{ method: "TEMPO", amount: "1" }],
      [{ method: "CASH", amount: "1" }, { method: "CASH", amount: "2" }],
    ]) expect(parseComparisonAmounts(rows)).toBeNull();
  });

  it("menyimpan snapshot POS termasuk metode yang belum dicatat dengan ketelitian sen", () => {
    expect(snapshotPaymentMethods([{ method: "TRANSFER", amount: 0.2 }, { method: "Belum dicatat", amount: 0.1 }])).toEqual([
      { method: "Belum dicatat", amount: "0.10" }, { method: "TRANSFER", amount: "0.20" },
    ]);
  });
});

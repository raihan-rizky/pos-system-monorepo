import { describe, expect, it } from "vitest";
import {
  calculateCorrectedPurchaseFinance,
  buildCorrectionFinancePlan,
  type CorrectedFinanceLine,
} from "../shopping-request-correction-finance";

describe("keuangan koreksi daftar belanja", () => {
  it("menghitung total dari jumlah diterima efektif", () => {
    const lines: CorrectedFinanceLine[] = [
      { receivedQty: 7, unitPrice: "95000.00" },
      { receivedQty: 2.5, unitPrice: "12000.50" },
    ];

    expect(calculateCorrectedPurchaseFinance(lines, "1000000.00")).toEqual({
      newTotal: "695001.25",
      paid: "1000000.00",
      remaining: "0.00",
      overpaid: "304998.75",
    });
  });

  it("mempertahankan pembayaran dan memberi peringatan saat total turun", () => {
    expect(calculateCorrectedPurchaseFinance([
      { receivedQty: 7, unitPrice: "100000.00" },
    ], "1000000.00")).toMatchObject({
      newTotal: "700000.00",
      paid: "1000000.00",
      overpaid: "300000.00",
    });
  });

  it("menyiapkan snapshot pembayaran dan peringatan ketika jumlah diterima dikoreksi", () => {
    const source = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE" as const, amount: "1000000.00", paidAt: "2026-10-01" };
    const allocation = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE" as const, amount: "1000000.00", method: "TRANSFER" as const };
    expect(buildCorrectionFinancePlan({
      oldTotal: "1000000.00",
      lines: [{ receivedQty: 7, unitPrice: "100000.00" }],
      sources: [source],
      allocations: [allocation],
      corrections: [],
    })).toEqual({
      oldTotal: "1000000.00", newTotal: "700000.00", paid: "1000000.00",
      remaining: "0.00", overpaid: "300000.00",
      byMethod: { TRANSFER: "1000000.00", GIRO: "0.00" },
      paymentSnapshot: { sources: [source], allocations: [allocation] },
    });
  });

  it("merekam rincian pembayaran yang dikoreksi tanpa mengubah sumber awal", () => {
    const source = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE" as const, amount: "1000000.00", paidAt: "2026-10-01" };
    const corrected = { ...source, amount: "700000.00", paidAt: "2026-10-03" };
    const allocation = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE" as const, amount: "700000.00", method: "GIRO" as const };
    const plan = buildCorrectionFinancePlan({ oldTotal: "1000000.00", lines: [{ receivedQty: 7, unitPrice: "100000.00" }], sources: [source], allocations: [allocation], corrections: [corrected] });
    expect(plan.paymentSnapshot).toEqual({ sources: [corrected], allocations: [allocation] });
    expect(plan.overpaid).toBe("0.00");
    expect(source.amount).toBe("1000000.00");
  });
});

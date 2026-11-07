import { describe, expect, it } from "vitest";
import { planCorrectionPayments } from "../shopping-request-correction";

type Source = { paymentId: string; sourceKind: "TRANSFER_EXPENSE" | "PAYABLE_PAYMENT"; amount: string; paidAt: string };
type Allocation = Pick<Source, "paymentId" | "sourceKind" | "amount"> & { method: "TRANSFER" | "GIRO" };

function plan(sources: Source[], allocations: Allocation[], corrections: Source[] = []) {
  return planCorrectionPayments(sources, allocations, corrections);
}

const transfer: Source = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", amount: "1000000.00", paidAt: "2026-10-01" };
const giro: Source = { paymentId: "payment-1", sourceKind: "PAYABLE_PAYMENT", amount: "200000.00", paidAt: "2026-10-12" };

describe("alokasi pembayaran koreksi daftar belanja", () => {
  it("membagi sumber Transfer tanpa menghitung pembayaran dua kali", () => {
    const allocations: Allocation[] = [
      { paymentId: transfer.paymentId, sourceKind: transfer.sourceKind, method: "TRANSFER", amount: "400000.00" },
      { paymentId: transfer.paymentId, sourceKind: transfer.sourceKind, method: "GIRO", amount: "600000.00" },
      { paymentId: giro.paymentId, sourceKind: giro.sourceKind, method: "GIRO", amount: "200000.00" },
    ];
    expect(plan([transfer, giro], allocations)).toEqual({
      sources: [transfer, giro], allocations, paid: "1200000.00",
      byMethod: { TRANSFER: "400000.00", GIRO: "800000.00" },
    });
  });

  it("memakai nominal dan tanggal yang secara khusus dikoreksi tanpa mengubah sumber asal", () => {
    const edited = { ...transfer, amount: "700000.00", paidAt: "2026-10-03" };
    const allocation: Allocation = { paymentId: transfer.paymentId, sourceKind: transfer.sourceKind, method: "GIRO", amount: "700000.00" };
    const result = plan([transfer], [allocation], [edited]);
    expect(result.sources).toEqual([edited]);
    expect(result.paid).toBe("700000.00");
    expect(transfer.amount).toBe("1000000.00");
    expect(transfer.paidAt).toBe("2026-10-01");
  });

  it("menolak alokasi yang kurang, berlebih, ganda, atau berasal dari sumber lain", () => {
    const allocation: Allocation = { paymentId: transfer.paymentId, sourceKind: transfer.sourceKind, method: "TRANSFER", amount: "900000.00" };
    expect(() => plan([transfer], [allocation])).toThrow(/alokasi/i);
    expect(() => plan([transfer], [{ ...allocation, amount: "1000000.01" }])).toThrow(/alokasi/i);
    expect(() => plan([transfer], [{ ...allocation, amount: "500000.00" }, { ...allocation, amount: "500000.00" }])).toThrow(/ganda|dua kali/i);
    expect(() => plan([transfer], [{ ...allocation, paymentId: "unknown" }])).toThrow(/sumber/i);
  });

  it("menolak koreksi sumber ganda, tanggal tidak sah, dan nominal negatif", () => {
    const allocation: Allocation = { paymentId: transfer.paymentId, sourceKind: transfer.sourceKind, method: "TRANSFER", amount: "1000000.00" };
    expect(() => plan([transfer], [allocation], [transfer, transfer])).toThrow(/ganda|dua kali/i);
    expect(() => plan([transfer], [allocation], [{ ...transfer, paidAt: "2026-02-30" }])).toThrow(/tanggal/i);
    expect(() => plan([transfer], [allocation], [{ ...transfer, amount: "-1.00" }])).toThrow(/nominal/i);
  });
});

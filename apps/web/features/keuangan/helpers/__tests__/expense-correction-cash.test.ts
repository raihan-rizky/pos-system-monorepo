import { describe, expect, it } from "vitest";
import { buildExpenseCorrectionCash } from "../expense-correction-cash";

describe("arus kas koreksi pengeluaran", () => {
  it("mempertahankan kas keluar dan mencatat refund pada tanggal penerimaan yang sebenarnya", () => {
    const settlements = [
      { kind: "REFUND" as const, amountCents: 800_000, paidAt: "2026-11-08", receivedAt: "2026-12-02" },
      { kind: "CREDIT" as const, amountCents: 300_000, paidAt: "2026-11-08", receivedAt: null },
      { kind: "ENTRY_ERROR" as const, amountCents: 200_000, paidAt: "2026-11-08", receivedAt: null },
    ];
    expect(buildExpenseCorrectionCash(settlements, "2026-11", "2026-12-20")).toEqual({
      outflow: [{ date: "2026-11-08", total: 11_000 }], refunds: [],
    });
    expect(buildExpenseCorrectionCash(settlements, "2026-12", "2026-12-20")).toEqual({
      outflow: [], refunds: [{ date: "2026-12-02", total: 8_000 }],
    });
  });

  it("menjumlahkan nominal dengan dua desimal dan membatasi hasil pada tanggal laporan", () => {
    const settlements = [
      { kind: "REFUND" as const, amountCents: 11, paidAt: "2026-11-08", receivedAt: "2026-11-20" },
      { kind: "CREDIT" as const, amountCents: 22, paidAt: "2026-11-08", receivedAt: null },
    ];
    expect(buildExpenseCorrectionCash(settlements, "2026-11", "2026-11-19")).toEqual({
      outflow: [{ date: "2026-11-08", total: 0.33 }], refunds: [],
    });
  });
});

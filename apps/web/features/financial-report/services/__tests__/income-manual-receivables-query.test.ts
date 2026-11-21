import { beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({ transactions: vi.fn(), income: vi.fn(), receivables: vi.fn() }));
vi.mock("@pos/db", () => ({ db: {
  transaction: { findMany: queries.transactions }, manualIncome: { findMany: queries.income },
  customerReceivable: { findMany: queries.receivables },
} }));
import { loadIncomePeriod } from "../daily-income";

describe("penerimaan piutang manual pada laporan harian", () => {
  beforeEach(() => {
    queries.transactions.mockResolvedValue([]);
    queries.income.mockResolvedValue([]);
    queries.receivables.mockResolvedValue([{ id: "debt", amount: 100, reportCategory: "SPANDUK", payments: [
      { id: "payment", method: "TRANSFER", amount: 100, paidAt: new Date("2026-11-10T00:00:00Z"), createdAt: new Date("2026-11-11T10:00:00Z") },
    ] }]);
  });

  it("mengambil pembayaran terkoreksi milik toko pada tanggal pembayarannya", async () => {
    const result = await loadIncomePeriod("store-1", "2026-11-10", "2026-11-10");
    expect(result.days[0]).toMatchObject({ total: 100, subcategories: [{ category: "Percetakan", subcategory: "Spanduk", amount: 100 }] });
    expect(queries.receivables.mock.calls[0][0].where.storeId).toBe("store-1");
  });
});

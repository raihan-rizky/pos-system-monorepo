import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ expenses: vi.fn(), payables: vi.fn(), backdated: vi.fn(), transaction: vi.fn() }));
vi.mock("@pos/db", async (loadOriginal) => {
  const actual = await loadOriginal<typeof import("@pos/db")>();
  const tx = { expense: { findMany: mocks.expenses }, supplierPayable: { findMany: mocks.payables },
    backdatedPurchase: { findMany: mocks.backdated } };
  return { ...actual, db: { $transaction: mocks.transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx)) } };
});
import { loadRecognizedExpenses } from "../recognized-finance";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const now = new Date("2026-11-30T12:00:00.000Z");
const transfer = {
  id: "transfer-1", storeId: "store-1", applicantName: "Penerima", category: "SUPPLIES", customCategoryId: null,
  description: "Transfer", amount: "200000", changeAmount: "0", occurredAt: new Date("2026-11-09T17:00:00.000Z"),
  createdAt: day("2026-11-10"), updatedAt: day("2026-11-11"), reportCategory: "CETAK_PLAT", transactionId: null,
  attachmentUrl: null, hasMissingCostSnapshot: false, manualPurchasePaymentMethod: "TRANSFER", goodsPurchaseId: null,
  shoppingRequestId: null, recordedBy: { id: "u1", name: "Pengguna" }, goodsPurchase: null, shoppingRequest: null,
};
const payable = (id: string, amount: number, category: string, dueDate: Date | null, payment: number) => ({
  id, storeId: "store-1", supplierName: `Rahasia ${id}`, amount, debtDate: day("2026-11-01"), dueDate,
  reportCategory: category, note: "Rahasia", payments: [{ id: `payment-${id}`, amount: payment, paidAt: day("2026-11-10"), origin: "MANUAL" }],
});

describe("pengeluaran hutang manual pada ringkasan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backdated.mockResolvedValue([]);
    mocks.payables.mockResolvedValue([
      payable("a", 200_000, "ATK", day("2026-11-20"), 100_000),
      payable("b", 100_000, "SPANDUK", null, 100_000),
    ]);
    mocks.expenses.mockImplementation(async ({ select }) => select.manualTransferAllocations
      ? [{ id: transfer.id, storeId: transfer.storeId, amount: transfer.amount, changeAmount: "0", occurredAt: transfer.occurredAt,
        reportCategory: transfer.reportCategory, manualTransferAllocations: [
          { paymentId: "payment-a", payableId: "a", amount: 70_000 },
          { paymentId: "payment-b", payableId: "b", amount: 100_000 },
        ] }]
      : [transfer]);
  });

  it("mengakui cicilan tersisa dan pelunasan otomatis pada tanggalnya tanpa menggandakan alokasi", async () => {
    const result = await loadRecognizedExpenses("store-1", "2026-11", now);
    expect(result.monthlyTotal).toBe(330_000);
    expect(result.daily.map(({ date, total }) => ({ date, total }))).toEqual([
      { date: "2026-11-10", total: 230_000 }, { date: "2026-11-20", total: 100_000 },
    ]);
    expect(result.byCategory).toEqual(expect.arrayContaining([
      { category: "report:ATK", total: 200_000 },
      { category: "report:SPANDUK", total: 100_000 },
      { category: "report:CETAK_PLAT", total: 30_000 },
    ]));
    expect(result.components).toMatchObject({ transfer: 200_000, manualPayable: 130_000 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.rows)).not.toContain("Rahasia");
    expect(JSON.stringify(result.rows)).not.toContain("payment-a");
  });

  it("mengembalikan kategori dan versi transfer agar form dapat mengubah data yang benar", async () => {
    const result = await loadRecognizedExpenses("store-1", "2026-11", now);
    expect(result.rows.find(row => row.id === "transfer-1")).toMatchObject({
      reportCategory: "CETAK_PLAT", updatedAt: "2026-11-11T00:00:00.000Z",
      reportCategories: ["report:ATK", "report:SPANDUK", "report:CETAK_PLAT"],
      reportCategoryAmounts: { "report:ATK": 70_000, "report:SPANDUK": 100_000, "report:CETAK_PLAT": 30_000 },
    });
  });
});

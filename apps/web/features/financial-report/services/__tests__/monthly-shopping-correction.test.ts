import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMonthlyFinancialReport } from "../monthly-report";

const mocks = vi.hoisted(() => ({ expense: vi.fn(), balances: vi.fn() }));
vi.mock("@pos/db", async (original) => ({
  ...await original(),
  db: { $transaction: (callback: (tx: unknown) => unknown) => callback({
    transaction: { findMany: async () => [] }, expense: { findMany: mocks.expense },
    customerReceivable: { findMany: async () => [] }, backdatedPurchase: { findMany: async () => [] }, manualIncome: { findMany: async () => [] },
  }) },
}));
vi.mock("../monthly-balances", () => ({ getMonthlyBalances: mocks.balances }));

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const now = new Date("2026-12-01T03:00:00.000Z");
function expense(input: { method?: "TRANSFER" | "GIRO"; sourceAmount?: string; sourceDate?: string; split?: boolean; invalid?: boolean } = {}) {
  const source = { sourceKind: "TRANSFER_EXPENSE", paymentId: "expense-1", amount: input.sourceAmount ?? "1000000.00", paidAt: input.sourceDate ?? "2026-10-02" };
  const allocations = input.split ? [
    { sourceKind: source.sourceKind, paymentId: source.paymentId, method: "TRANSFER", amount: "100000.00" },
    { sourceKind: source.sourceKind, paymentId: source.paymentId, method: "GIRO", amount: "200000.00" },
  ] : [{ sourceKind: source.sourceKind, paymentId: source.paymentId, method: input.method ?? "TRANSFER", amount: source.amount }];
  const correction = { id: "correction-1", afterSnapshot: input.invalid ? {} : { paymentSnapshot: { sources: [source], allocations } }, allocations: allocations.map(allocation => ({ ...allocation, sourceAmount: source.amount, paidAt: date(source.paidAt) })) };
  return { id: "expense-1", storeId: "store-1", occurredAt: date("2026-11-01"), category: "SUPPLIES", amount: "700000.00", changeAmount: "0.00", description: "Belanja terkoreksi", goodsPurchaseId: "purchase-1", shoppingRequestId: "request-1", shoppingRequest: { status: "APPROVED" }, goodsPurchase: {
    id: "purchase-1", storeId: "store-1", number: "PB-1", status: "APPROVED", totalAmount: "700000.00", paymentMethod: input.method ?? "TRANSFER", paymentDueDate: input.method === "GIRO" ? date("2026-11-20") : null, supplierNameSnapshot: "Pemasok Uji", shoppingRequest: { corrections: [correction] },
    supplierPayable: input.method === "GIRO" ? { id: "payable-1", storeId: "store-1", amount: "700000.00", debtDate: date("2026-10-01"), dueDate: date("2026-11-20"), note: null, giroHistoryVerifiedAt: date("2026-10-01"), payments: [{ id: "new-payment", amount: "200000.00", paidAt: date("2026-11-03") }] } : null,
  } };
}

describe("laporan uang aktual setelah koreksi belanja", () => {
  it("memasukkan Transfer permanen baru setelah audit pra-penerimaan kosong pada tanggal aslinya", async () => {
    const row = expense();
    Object.assign(row.goodsPurchase, { initialTransferAmount: "8800.00", initialTransferPaidAt: date("2026-10-02") });
    row.goodsPurchase.shoppingRequest.corrections = [{ id: "pre-receipt", afterSnapshot: { paymentSnapshot: { sources: [], allocations: [] } }, allocations: [] }];
    mocks.expense.mockResolvedValue([row]);
    const result = await getMonthlyFinancialReport("store-1", 2026, 10, now);
    expect(result.purchasePayments).toEqual([expect.objectContaining({ amount: 8800, date: "2026-10-02", method: "TRANSFER" })]);
  });
  beforeEach(() => {
    mocks.expense.mockReset();
    mocks.balances.mockReset().mockResolvedValue({ openingInventoryBalance: 0, inventoryBalance: 0, supplierDebts: [], supplierDebtBalance: 0 });
  });

  it("mempertahankan uang Transfer dan tanggal aslinya saat nilai belanja serta tanggal usaha berubah", async () => {
    mocks.expense.mockResolvedValue([expense()]);
    const october = await getMonthlyFinancialReport("store-1", 2026, 10, now);
    expect(october.purchasePayments).toEqual([expect.objectContaining({ amount: 1000000, date: "2026-10-02", method: "TRANSFER", reference: "PB-1" })]);
    expect(october.purchaseExpenses).toEqual([]);
    const november = await getMonthlyFinancialReport("store-1", 2026, 11, now);
    expect(november.purchaseExpenses).toEqual([expect.objectContaining({ amount: 700000, date: "2026-11-01" })]);
    expect(november.purchasePayments).toEqual([]);
  });

  it("menghitung alokasi lintas metode sekali, pembayaran baru, serta sisa utang sesuai tanggal", async () => {
    mocks.expense.mockResolvedValue([expense({ method: "GIRO", sourceAmount: "300000.00", sourceDate: "2026-10-31", split: true })]);
    mocks.balances.mockResolvedValue({ openingInventoryBalance: 0, inventoryBalance: 0, supplierDebts: [{ id: "payable-1", date: "2026-10-01", dueDate: "2026-11-20", supplier: "Pemasok Uji", note: null, amount: 500000 }], supplierDebtBalance: 500000 });
    const october = await getMonthlyFinancialReport("store-1", 2026, 10, now);
    expect(october.purchasePayments).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 100000, date: "2026-10-31", method: "TRANSFER" }),
      expect.objectContaining({ amount: 200000, date: "2026-10-31", method: "GIRO" }),
    ]));
    expect(october.supplierDebtBalance).toBe(400000);
    const november = await getMonthlyFinancialReport("store-1", 2026, 11, now);
    expect(november.purchasePayments).toEqual([expect.objectContaining({ amount: 200000, date: "2026-11-03", method: "GIRO" })]);
    expect(november.supplierDebtBalance).toBe(200000);
  });

  it("tidak membatasi pembayaran berlebih menjadi total belanja atau menganggapnya dikembalikan", async () => {
    const row = expense({ method: "GIRO" });
    row.goodsPurchase.supplierPayable!.payments = [];
    mocks.expense.mockResolvedValue([row]);
    mocks.balances.mockResolvedValue({ openingInventoryBalance: 0, inventoryBalance: 0, supplierDebts: [{ id: "payable-1", date: "2026-10-01", dueDate: "2026-11-20", supplier: "Pemasok Uji", note: null, amount: 700000 }], supplierDebtBalance: 700000 });
    const result = await getMonthlyFinancialReport("store-1", 2026, 10, now);
    expect(result.purchasePayments).toEqual([expect.objectContaining({ amount: 1000000, method: "GIRO" })]);
    expect(result.supplierDebtBalance).toBe(0);
  });

  it("menandai kas dan utang belum lengkap jika snapshot pembayaran koreksi rusak", async () => {
    mocks.expense.mockResolvedValue([expense({ invalid: true })]);
    const result = await getMonthlyFinancialReport("store-1", 2026, 11, now);
    expect(result.cashIncomplete).toBe(true);
    expect(result.supplierDebtBalance).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/koreksi.*pembayaran|pembayaran.*koreksi/i);
  });

  it("tidak menghitung dua kali jadwal Transfer pembelian yang telah dikoreksi", async () => {
    const row = expense({ sourceDate: "2026-11-01" });
    Object.assign(row.goodsPurchase, { payments: [{ id: "schedule-1", method: "TRANSFER", amount: "700000.00", dueDate: null }] });
    mocks.expense.mockResolvedValue([row]);
    const result = await getMonthlyFinancialReport("store-1", 2026, 11, now);
    expect(result.purchasePayments?.map(payment => payment.amount)).toEqual([1000000]);
  });

  it("mempertahankan pembayaran belanja lain meski referensinya sama", async () => {
    const row = expense({ method: "GIRO", sourceDate: "2026-11-01" });
    row.goodsPurchase.supplierPayable!.payments = [];
    mocks.expense.mockResolvedValue([row]);
    const report = await getMonthlyFinancialReport("store-1", 2026, 11, now);
    const { applyShoppingCorrectionReportPayments } = await import("../../helpers/shopping-correction-report-payments");
    // A backdated purchase may use the same reference as a goods purchase.
    report.giroPayments = [{ id: "backdated:other:payment", reference: "PB-1", supplier: "Lain", date: "2026-11-04", amount: 50000, group: "OTHER" }];
    applyShoppingCorrectionReportPayments(report, [{
      expenseId: row.id, occurredAt: row.occurredAt,
      purchase: row.goodsPurchase,
      correction: row.goodsPurchase.shoppingRequest.corrections[0],
    }]);
    expect(report.purchasePayments).toEqual(expect.arrayContaining([expect.objectContaining({ id: "backdated:other:payment", amount: 50000 })]));
  });
});

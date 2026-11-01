import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findExpenses: vi.fn(), countExpenses: vi.fn(), aggregateExpenses: vi.fn(),
  findTransactions: vi.fn(), findReceivables: vi.fn(), findShifts: vi.fn(),
  findInventory: vi.fn(), findDebtPayments: vi.fn(), findBackdated: vi.fn(), requirePermission: vi.fn(),
}));

vi.mock("@pos/db", () => {
  const tx = {
    expense: { findMany: mocks.findExpenses, count: mocks.countExpenses, aggregate: mocks.aggregateExpenses },
    transaction: { findMany: mocks.findTransactions },
    customerReceivable: { findMany: mocks.findReceivables },
    cashierShift: { findMany: mocks.findShifts },
    inventoryLog: { findMany: mocks.findInventory },
    debtPaymentLog: { findMany: mocks.findDebtPayments },
    backdatedPurchase: { findMany: mocks.findBackdated },
  };
  return { db: { ...tx, $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) } };
});
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.requirePermission, handleAuthError: () => null }));
vi.mock("@/features/financial-report/services/monthly-balances", () => ({
  getMonthlyBalances: async () => ({ openingInventoryBalance: null, inventoryBalance: null, supplierDebts: [], supplierDebtBalance: 0 }),
}));
vi.mock("@/features/financial-report/services/initial-collections", () => ({ findInitialCollections: async () => [] }));

import { GET as getExpenseList } from "@/app/api/finance/expenses/route";
import { GET as getExpenseSummary } from "@/app/api/finance/expenses/summary/route";
import { GET as getJournal } from "@/app/api/finance/report/journal/route";
import { GET as getReport } from "@/app/api/finance/report/route";
import { getMonthlyFinancialReport } from "@/features/financial-report/services/monthly-report";
import { getFinancialReportAnalysis } from "@/features/ai-assistant/repositories/assistant-tools-repository";

const purchase = { id: "purchase-1", reference: "GIRO-123", paymentMethod: "GIRO", dueDate: new Date("2026-11-10T00:00:00Z") };
const base = {
  storeId: "store-1", deletedAt: null, applicantName: "Belanja Terdahulu", category: "SUPPLIES",
  customCategoryId: null, customCategory: null, changeAmount: "0", transactionId: null, attachmentUrl: null,
  hasMissingCostSnapshot: false, shoppingRequest: null, goodsPurchase: null,
  recordedBy: { id: "user-1", name: "Admin" }, createdAt: new Date("2026-11-01T00:00:00Z"),
};
const ledger = [
  { ...base, id: "payment-oct", amount: "4000000", occurredAt: new Date("2026-10-29T17:00:00Z"), description: "Pembayaran Oktober", backdatedPurchaseDueId: null, backdatedPurchaseDue: null, backdatedPurchasePayment: { purchase } },
  { ...base, id: "payment-nov", amount: "2000000", occurredAt: new Date("2026-11-01T17:00:00Z"), description: "Pembayaran November", backdatedPurchaseDueId: null, backdatedPurchaseDue: null, backdatedPurchasePayment: { purchase } },
  { ...base, id: "due", amount: "4000000", occurredAt: new Date("2026-11-09T17:00:00Z"), description: "Jatuh tempo", backdatedPurchaseDueId: purchase.id, backdatedPurchaseDue: purchase, backdatedPurchasePayment: null },
  { ...base, id: "other-store", storeId: "store-2", amount: "9000000", occurredAt: new Date("2026-11-01T17:00:00Z"), description: "Toko lain", backdatedPurchaseDueId: null, backdatedPurchaseDue: null, backdatedPurchasePayment: { purchase } },
  { ...base, id: "deleted", deletedAt: new Date("2026-11-03T00:00:00Z"), amount: "8000000", occurredAt: new Date("2026-11-01T17:00:00Z"), description: "Terhapus", backdatedPurchaseDueId: null, backdatedPurchaseDue: null, backdatedPurchasePayment: { purchase } },
];

type ExpenseWhere = {
  storeId: string; deletedAt: null; hasMissingCostSnapshot?: boolean;
  occurredAt: { gte: Date; lt: Date };
  OR?: Array<{ backdatedPurchaseDueId?: null; occurredAt?: { lt: Date } }>;
};

// The in-memory adapter evaluates the Prisma predicates emitted by each real reader.
function queryExpenses(where: ExpenseWhere) {
  if ("backdatedPurchasePaymentId" in where) return [];
  return ledger.filter((row) => row.storeId === where.storeId && row.deletedAt === where.deletedAt
    && row.occurredAt >= where.occurredAt.gte && row.occurredAt < where.occurredAt.lt
    && (where.hasMissingCostSnapshot === undefined || row.hasMissingCostSnapshot === where.hasMissingCostSnapshot)
    && (!where.OR || where.OR.some((clause) =>
      ("backdatedPurchaseDueId" in clause && row.backdatedPurchaseDueId === clause.backdatedPurchaseDueId)
      || (clause.occurredAt !== undefined && row.occurredAt < clause.occurredAt.lt))));
}

describe("pembacaan keuangan belanja terdahulu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.findTransactions.mockResolvedValue([]);
    mocks.findReceivables.mockResolvedValue([]);
    mocks.findShifts.mockResolvedValue([]);
    mocks.findInventory.mockResolvedValue([]);
    mocks.findDebtPayments.mockResolvedValue([]);
    mocks.findBackdated.mockImplementation(async ({ where }) => where.storeId !== "store-1" ? [] : [{
      ...purchase, purchaseDate: new Date("2026-10-01T00:00:00Z"), amount: "10000000",
      payments: [
        { id: "pay-oct", amount: "4000000", paidAt: new Date("2026-10-30T00:00:00Z") },
        { id: "pay-nov", amount: "2000000", paidAt: new Date("2026-11-02T00:00:00Z") },
      ],
    }]);
    mocks.findExpenses.mockImplementation(async ({ where }) => queryExpenses(where));
    mocks.countExpenses.mockImplementation(async ({ where }) => queryExpenses(where).length);
    mocks.aggregateExpenses.mockImplementation(async ({ where }) => {
      const rows = queryExpenses(where);
      return { _sum: { amount: rows.reduce((sum, row) => sum + Number(row.amount), 0), changeAmount: 0 }, _count: { _all: rows.length } };
    });
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["2026-11-09T16:59:59.999Z", 2_000_000, ["payment-nov"]],
    ["2026-11-09T17:00:00.000Z", 6_000_000, ["payment-nov", "due"]],
  ])("menyelaraskan pengakuan dan kas belanja terdahulu pada %s", async (now, expected, ids) => {
    vi.setSystemTime(new Date(now));
    const listResponse = await getExpenseList(new Request("http://localhost/api/finance/expenses?month=2026-11"));
    const summaryResponse = await getExpenseSummary(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"));
    const journalResponse = await getJournal(new Request("http://localhost/api/finance/report/journal?period=monthly"));
    const reportResponse = await getReport(new Request("http://localhost/api/finance/report?dateFrom=2026-11-01&dateTo=2026-11-30"));
    expect([listResponse.status, summaryResponse.status, journalResponse.status, reportResponse.status]).toEqual([200, 200, 200, 200]);
    const list = await listResponse.json();
    const summary = await summaryResponse.json();
    const journal = await journalResponse.json();
    const report = await reportResponse.json();
    const monthly = await getMonthlyFinancialReport("store-1", 2026, 11, new Date(now));
    const assistant = await getFinancialReportAnalysis({ storeId: "store-1", dateFrom: "2026-11-01", dateTo: "2026-11-30" });

    expect(list.data.map((row: { id: string }) => row.id).sort()).toEqual([...ids].sort());
    expect(list.data.every((row: { source: unknown }) => JSON.stringify(row.source) === JSON.stringify({ type: "BACKDATED_PURCHASE", id: "purchase-1", number: "GIRO-123" }))).toBe(true);
    expect(summary.monthlyTotal).toBe(expected);
    // Journal expenses are represented as negative amounts.
    expect(journal.footer.totalPengeluaran).toBe(-expected);
    expect(report.summary.expenseTotal).toBe(expected);
    expect(monthly.expenses).toEqual([]);
    expect(monthly.purchaseExpenses).toEqual([expect.objectContaining({ amount: 10000000, date: "2026-11-10", purchase: expect.objectContaining({ reference: "GIRO-123", method: "GIRO" }) })]);
    expect(monthly.giroPayments).toEqual([expect.objectContaining({ amount: 2000000, date: "2026-11-02" })]);
    expect(monthly.supplierDebtBalance).toBe(4000000);
    expect(assistant.summary.expenseTotal).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";
import { buildCustomerDetailRecap, type BuildCustomerDetailRecapInput } from "../recap-core";

const base: BuildCustomerDetailRecapInput = {
  customer: { id: "customer-1", name: "Pelanggan Contoh", type: "UMUM", totalDebt: 999000, createdAt: new Date("2026-01-01"), lastVisitAt: null },
  dateFrom: "2026-05-01", dateTo: "2026-05-03", transactions: [], debtPaymentLogs: [],
};

interface DebtFixture {
  id: string;
  createdAt: string;
  paidAt?: string;
  amount?: number;
  amountPaid?: number;
  downPayment?: number;
  customerId?: string;
}

function buildDebtRecap(debts: DebtFixture[]) {
  return buildCustomerDetailRecap({
    ...base,
    transactions: debts.map(debt => ({
      id: debt.id, customerId: debt.customerId ?? "customer-1", createdAt: new Date(debt.createdAt),
      status: debt.paidAt ? "COMPLETED" : "DP", total: debt.amount ?? 30000,
      amountPaid: debt.paidAt ? debt.amount ?? 30000 : debt.amountPaid ?? 0, items: [],
    })),
    debtPaymentLogs: debts.flatMap(debt => debt.paidAt ? [{
      transactionId: debt.id, customerId: debt.customerId ?? "customer-1",
      amount: (debt.amount ?? 30000) - (debt.downPayment ?? 0), createdAt: new Date(debt.paidAt),
    }] : []),
  });
}

describe("customer detail period KPIs", () => {
  it("counts remaining balances only for debt originating within the selected period", () => {
    const recap = buildDebtRecap([
      { id: "dp", createdAt: "2026-05-02T00:00:00+07:00", amount: 100000, amountPaid: 40000 },
      { id: "in", createdAt: "2026-05-01T00:00:00+07:00", amount: 80000, amountPaid: 30000 },
      { id: "old", createdAt: "2026-04-30T23:59:59+07:00" },
      { id: "future", createdAt: "2026-05-04T00:00:00+07:00" },
      { id: "other", createdAt: "2026-05-02T00:00:00+07:00", customerId: "other" },
    ]);
    expect(recap.summary).toMatchObject({ debtUnpaidInPeriod: 110000, debtPaidOffInPeriod: 0, averagePaymentDays: null });
  });

  it("includes old debt settled in the period and excludes partial payments from paid-off totals", () => {
    const recap = buildDebtRecap([
      { id: "old-dp", createdAt: "2026-04-29T10:00:00+07:00", paidAt: "2026-05-01T10:00:00+07:00", amount: 60000, downPayment: 20000 },
      { id: "paid", createdAt: "2026-05-01T10:00:00+07:00", paidAt: "2026-05-03T10:00:00+07:00" },
      { id: "partial", createdAt: "2026-05-02T10:00:00+07:00", amountPaid: 10000 },
    ]);
    expect(recap.summary).toMatchObject({ debtUnpaidInPeriod: 20000, debtPaidOffInPeriod: 70000, averagePaymentDays: 2 });
  });

  it("averages each settled debt rather than each chart bucket", () => {
    const recap = buildDebtRecap([
      { id: "same-day-a", createdAt: "2026-05-01T10:00:00+07:00", paidAt: "2026-05-01T10:00:00+07:00" },
      { id: "same-day-b", createdAt: "2026-05-01T10:00:00+07:00", paidAt: "2026-05-01T10:00:00+07:00" },
      { id: "two-days", createdAt: "2026-04-30T10:00:00+07:00", paidAt: "2026-05-02T10:00:00+07:00" },
    ]);
    expect(recap.summary).toMatchObject({ debtPaidOffInPeriod: 90000 });
    expect(recap.summary).toHaveProperty("averagePaymentDays", 2 / 3);
  });

  it("distinguishes no settlements from a same-day settlement", () => {
    expect(buildCustomerDetailRecap(base).summary).toHaveProperty("averagePaymentDays", null);
    expect(buildDebtRecap([{ id: "same", createdAt: "2026-05-01T10:00:00+07:00", paidAt: "2026-05-01T11:00:00+07:00" }]).summary)
      .toMatchObject({ debtPaidOffInPeriod: 30000, averagePaymentDays: 0 });
  });

  it("uses inclusive WIB calendar boundaries for settlements", () => {
    const recap = buildDebtRecap([
      { id: "start", createdAt: "2026-04-29T17:00:00Z", paidAt: "2026-04-30T17:00:00Z" },
      { id: "end", createdAt: "2026-05-02T16:59:59Z", paidAt: "2026-05-03T16:59:59Z" },
      { id: "before", createdAt: "2026-04-29T16:59:59Z", paidAt: "2026-04-30T16:59:59Z" },
      { id: "after", createdAt: "2026-05-02T17:00:00Z", paidAt: "2026-05-03T17:00:00Z" },
    ]);
    expect(recap.summary).toMatchObject({ debtPaidOffInPeriod: 60000, averagePaymentDays: 1 });
  });

  it.each([
    ["2026-05-01T00:00:00+07:00", "2026-05-01T23:59:59+07:00", 0],
    ["2026-05-01T23:30:00+07:00", "2026-05-02T00:30:00+07:00", 1],
  ])("uses WIB calendar days from %s to %s", (createdAt, paidAt, days) => {
    const recap = buildDebtRecap([{ id: "calendar-days", createdAt, paidAt }]);
    expect(recap.summary).toHaveProperty("averagePaymentDays", days);
  });
});

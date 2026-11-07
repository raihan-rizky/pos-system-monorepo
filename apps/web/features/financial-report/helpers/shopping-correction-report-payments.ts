import { Prisma } from "@pos/db";
import { readCorrectionPaymentSnapshot } from "@/features/suppliers/shopping-requests/repositories/shopping-request-correction-payment-snapshot";
import type { MonthlyFinancialReport, MonthlyPurchasePayment } from "./monthly-report-types";

type Correction = {
  afterSnapshot: unknown;
  allocations: Array<{ sourceKind: string; paymentId: string; method: string; amount: unknown; sourceAmount: unknown; paidAt: Date }>;
};
export type CorrectedReportPurchase = {
  expenseId: string;
  occurredAt: Date;
  correction: Correction;
  purchase: {
    id: string; number: string; totalAmount: unknown; paymentMethod: string | null;
    initialTransferAmount?: unknown; initialTransferPaidAt?: Date | null;
    paymentDueDate: Date | null; supplierNameSnapshot: string;
    supplierPayable?: { id: string; amount: unknown; debtDate: Date; dueDate: Date | null; note: string | null; payments: Array<{ id: string; amount: unknown; paidAt: Date }> } | null;
  };
};

const money = (value: unknown) => new Prisma.Decimal(String(value)).toFixed(2);
const key = (source: { sourceKind: string; paymentId: string }) => JSON.stringify([source.sourceKind, source.paymentId]);

function correctedPayments(input: CorrectedReportPurchase): MonthlyPurchasePayment[] {
  const snapshot = readCorrectionPaymentSnapshot(input.correction.afterSnapshot);
  const sources = new Map(snapshot.sources.map(source => [key(source), source]));
  const allocations = new Map(snapshot.allocations.map(allocation => [JSON.stringify([key(allocation), allocation.method]), allocation]));
  const stored = new Set<string>();
  if (input.correction.allocations.length !== snapshot.allocations.length) throw new Error("Alokasi pembayaran koreksi tidak lengkap.");
  for (const row of input.correction.allocations) {
    const pair = JSON.stringify([key(row), row.method]);
    const source = sources.get(key(row));
    const allocation = allocations.get(pair);
    if (stored.has(pair) || !source || !allocation || money(row.amount) !== allocation.amount ||
        money(row.sourceAmount) !== source.amount || row.paidAt.toISOString().slice(0, 10) !== source.paidAt) {
      throw new Error("Alokasi pembayaran koreksi tidak sesuai dengan riwayat.");
    }
    stored.add(pair);
  }
  const payablePayments = new Map((input.purchase.supplierPayable?.payments ?? []).map(payment => [payment.id, payment]));
  for (const source of snapshot.sources) {
    if ((source.sourceKind === "TRANSFER_EXPENSE" && source.paymentId !== input.expenseId) ||
        (source.sourceKind === "PAYABLE_PAYMENT" && !payablePayments.has(source.paymentId))) {
      throw new Error("Sumber pembayaran koreksi tidak tersedia.");
    }
  }
  const reference = input.purchase.number;
  const supplier = input.purchase.supplierNameSnapshot;
  const result: MonthlyPurchasePayment[] = snapshot.allocations.map(allocation => ({
    id: `${allocation.sourceKind}:${allocation.paymentId}:${allocation.method}`,
    date: sources.get(key(allocation))!.paidAt, amount: Number(allocation.amount),
    method: allocation.method, reference, supplier, group: "OTHER",
  }));
  if (input.purchase.initialTransferAmount != null && input.purchase.initialTransferPaidAt &&
      !sources.has(key({ sourceKind: "TRANSFER_EXPENSE", paymentId: input.expenseId }))) {
    result.push({ id: `TRANSFER_EXPENSE:${input.expenseId}:TRANSFER`, date: input.purchase.initialTransferPaidAt.toISOString().slice(0, 10),
      amount: Number(money(input.purchase.initialTransferAmount)), method: "TRANSFER", reference, supplier, group: "OTHER" });
  }
  for (const payment of payablePayments.values()) {
    if (!sources.has(key({ sourceKind: "PAYABLE_PAYMENT", paymentId: payment.id }))) {
      result.push({ id: payment.id, date: payment.paidAt.toISOString().slice(0, 10), amount: Number(money(payment.amount)), method: "GIRO", reference, supplier, group: "OTHER" });
    }
  }
  return result.filter(payment => payment.amount > 0);
}

/** Purchase cost can change while the original cash ledger remains unchanged. */
export function applyShoppingCorrectionReportPayments(report: MonthlyFinancialReport, inputs: CorrectedReportPurchase[]): void {
  if (!inputs.length) return;
  const unique = [...new Map(inputs.map(input => [input.purchase.id, input])).values()];
  const correctedExpenses = new Set(unique.flatMap(input => [input.expenseId, `${input.expenseId}:transfer`]));
  const correctedPaymentIds = new Set(unique.flatMap(input => (input.purchase.supplierPayable?.payments ?? []).map(payment => payment.id)));
  const legacyGiro = (report.giroPayments ?? []).filter(payment => !correctedPaymentIds.has(payment.id));
  const payments: MonthlyPurchasePayment[] = [
    ...(report.purchaseExpenses ?? []).filter(row => row.purchase?.method === "TRANSFER" && !correctedExpenses.has(row.id))
      .map(row => ({ id: row.id, date: row.date, amount: row.amount, method: "TRANSFER" as const, reference: row.purchase!.reference, supplier: row.purchase!.supplier, group: row.group })),
    ...legacyGiro.map(payment => ({ ...payment, method: "GIRO" as const })),
  ];
  const giro = [...legacyGiro];
  const debts = new Map((report.supplierDebts ?? []).map(debt => [debt.id, debt]));
  for (const input of unique) {
    try {
      const effective = correctedPayments(input);
      const inPeriod = effective.filter(payment => payment.date >= report.from && payment.date <= report.to);
      payments.push(...inPeriod);
      giro.push(...inPeriod.filter(payment => payment.method === "GIRO"));
      const payable = input.purchase.supplierPayable;
      if (payable) debts.delete(payable.id);
      const debtDate = payable?.debtDate.toISOString().slice(0, 10) ?? new Date(input.occurredAt.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const paidCents = effective.filter(payment => payment.date <= report.to).reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
      const remaining = Math.max(0, Math.round(Number(payable?.amount ?? input.purchase.totalAmount) * 100) - paidCents) / 100;
      if (debtDate <= report.to && remaining > 0) {
        const id = payable?.id ?? `corrected-purchase:${input.purchase.id}`;
        debts.set(id, { id, date: debtDate, dueDate: (payable?.dueDate ?? input.purchase.paymentDueDate)?.toISOString().slice(0, 10) ?? null, supplier: input.purchase.supplierNameSnapshot, note: payable?.note ?? null, amount: remaining });
      }
    } catch {
      report.cashIncomplete = true;
      report.supplierDebtIncomplete = true;
      if (!report.warnings.some(warning => warning.includes("pembayaran koreksi"))) report.warnings.push("Riwayat pembayaran koreksi belum lengkap; periksa kas dan utang pembelian.");
    }
  }
  // An empty array is authoritative: there was no actual payment in this period.
  report.purchasePayments = payments.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  report.giroPayments = giro.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  report.supplierDebts = [...debts.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  report.supplierDebtBalance = report.supplierDebtIncomplete ? null : report.supplierDebts.reduce((sum, debt) => sum + Math.round(debt.amount * 100), 0) / 100;
}

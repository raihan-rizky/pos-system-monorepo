import { isManualExpenseReportCategory, type ManualExpenseReportCategory } from "@/features/keuangan/helpers/manual-report-categories";
import { projectPayableLedger, type ManualPayablePayment } from "@/features/keuangan/helpers/payable-ledger";
import { allocateTransfer, type TransferAllocationResult } from "@/features/keuangan/helpers/transfer-allocations";
import { validDate } from "@/features/keuangan/helpers/supplier-payable-input";

type Payable = {
  id: string; storeId: string; supplierName: string; amountCents: number;
  debtDate: string; dueDate: string | null; category: ManualExpenseReportCategory | null; note?: string | null;
  payments: ManualPayablePayment[];
};
type Transfer = {
  id: string; storeId: string; date: string; amountCents: number; category: ManualExpenseReportCategory | null;
  allocations: Array<{ paymentId: string; payableId: string; amountCents: number }>;
};
type EffectivePayment = {
  id: string; payableId: string; supplierName: string; date: string; amountCents: number;
  category: ManualExpenseReportCategory | null; origin: "MANUAL" | "AUTO" | "CORRECTED_AUTO";
};

export function buildManualPayableReport(input: {
  storeId: string; todayWib: string; from: string; to: string; payables: Payable[]; transfers: Transfer[];
}): { payments: EffectivePayment[]; transfers: Array<{ id: string; segments: TransferAllocationResult["segments"] }>;
  balances: Array<{ id: string; date: string; dueDate: string | null; supplier: string; note: string | null; amountCents: number }> } {
  if (!input.storeId || !validDate(input.todayWib) || !validDate(input.from) || !validDate(input.to) || input.from > input.to || input.to > input.todayWib) {
    throw new Error("Periode laporan hutang tidak valid.");
  }
  const payableIds = new Set<string>();
  const payments = new Map<string, EffectivePayment>();
  const balances: Array<{ id: string; date: string; dueDate: string | null; supplier: string; note: string | null; amountCents: number }> = [];
  for (const payable of input.payables) {
    if (payable.storeId !== input.storeId || payableIds.has(payable.id)
      || (payable.category !== null && !isManualExpenseReportCategory(payable.category))) {
      throw new Error("Data hutang laporan tidak valid.");
    }
    payableIds.add(payable.id);
    const projection = projectPayableLedger({
      payableId: payable.id, amountCents: payable.amountCents, debtDate: payable.debtDate,
      dueDate: payable.dueDate, todayWib: input.todayWib, payments: payable.payments,
    });
    const paidAtEnd = projection.payments.filter(event => event.paidAt <= input.to).reduce((sum, event) => sum + event.amountCents, 0);
    const balance = payable.amountCents - paidAtEnd;
    if (payable.debtDate <= input.to && balance > 0) balances.push({ id: payable.id, date: payable.debtDate,
      dueDate: payable.dueDate, supplier: payable.supplierName, note: payable.note ?? null, amountCents: balance });
    for (const event of projection.payments) {
      if (payments.has(event.id)) throw new Error("Pembayaran hutang duplikat.");
      payments.set(event.id, { id: event.id, payableId: payable.id, supplierName: payable.supplierName,
        date: event.paidAt, amountCents: event.amountCents, category: payable.category, origin: event.origin });
    }
  }

  const transferIds = new Set<string>();
  const allocated = new Map<string, number>();
  const transfers = input.transfers.map(transfer => {
    if (transferIds.has(transfer.id) || transfer.date < input.from || transfer.date > input.to) throw new Error("Transfer di luar periode laporan atau duplikat.");
    transferIds.add(transfer.id);
    const allocations = transfer.allocations.map(allocation => {
      const payment = payments.get(allocation.paymentId);
      if (!payment || payment.payableId !== allocation.payableId || allocated.has(payment.id)) {
        throw new Error("Hubungan pembayaran hutang tidak valid.");
      }
      allocated.set(payment.id, allocation.amountCents);
      return { ...allocation, storeId: input.storeId, paidAt: payment.date,
        paymentAmountCents: payment.amountCents, category: payment.category };
    });
    const result = allocateTransfer({ storeId: input.storeId, transfer, allocations });
    return { id: transfer.id, segments: result.segments };
  });
  const unallocated = [...payments.values()].flatMap(payment => {
    const amountCents = payment.amountCents - (allocated.get(payment.id) ?? 0);
    return amountCents > 0 && payment.date >= input.from && payment.date <= input.to ? [{ ...payment, amountCents }] : [];
  });
  unallocated.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { payments: unallocated, transfers, balances };
}

import type { Prisma, PrismaClient } from "@pos/db";
import { buildManualPayableReport } from "../helpers/manual-payable-report";

type Client = Pick<Prisma.TransactionClient, "supplierPayable" | "expense">;
const calendarDate = (date: Date) => date.toISOString().slice(0, 10);
const wibDate = (date: Date) => new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

export async function withManualPayableSnapshot<T>(client: Pick<PrismaClient, "$transaction">, storeId: string, from: string, to: string,
  read: (tx: Prisma.TransactionClient) => Promise<T>) {
  return client.$transaction(async tx => {
    const data = await read(tx);
    const payables = await loadManualPayablePeriod(tx, storeId, from, to);
    return { data, payables };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}

/** Use the same manual ledger and transfer allocation rules as the monthly report. */
export async function loadManualPayablePeriod(client: Client, storeId: string, from: string, to: string, now = new Date()) {
  const todayWib = wibDate(now);
  if (from > todayWib) return { payments: [], transfers: [], balances: [] };
  const effectiveTo = to > todayWib ? todayWib : to;
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(new Date(`${effectiveTo}T00:00:00+07:00`).getTime() + 86_400_000);
  const [payables, transfers] = await Promise.all([
    client.supplierPayable.findMany({
      where: { storeId, goodsPurchaseId: null, debtDate: { lte: new Date(`${effectiveTo}T00:00:00Z`) } },
      select: { id: true, storeId: true, supplierName: true, amount: true, debtDate: true, dueDate: true, reportCategory: true, note: true,
        payments: { where: { paidAt: { lte: new Date(`${todayWib}T00:00:00Z`) } }, select: { id: true, amount: true, paidAt: true, origin: true } } },
    }),
    client.expense.findMany({
      where: { storeId, deletedAt: null, goodsPurchaseId: null, shoppingRequestId: null, backdatedPurchaseDueId: null, backdatedPurchasePaymentId: null,
        manualPurchasePaymentMethod: "TRANSFER", occurredAt: { gte: start, lt: end }, manualTransferAllocations: { some: {} } },
      select: { id: true, storeId: true, amount: true, changeAmount: true, occurredAt: true, reportCategory: true,
        manualTransferAllocations: { select: { paymentId: true, payableId: true, amount: true } } },
    }),
  ]);
  return buildManualPayableReport({ storeId, from, to: effectiveTo, todayWib,
    payables: payables.map(debt => ({ id: debt.id, storeId: debt.storeId, supplierName: debt.supplierName, amountCents: Math.round(Number(debt.amount) * 100),
      debtDate: calendarDate(debt.debtDate), dueDate: debt.dueDate ? calendarDate(debt.dueDate) : null, category: debt.reportCategory, note: debt.note,
      payments: debt.payments.map(payment => ({ id: payment.id, amountCents: Math.round(Number(payment.amount) * 100), paidAt: calendarDate(payment.paidAt), origin: payment.origin })) })),
    transfers: transfers.map(transfer => ({ id: transfer.id, storeId: transfer.storeId, date: wibDate(transfer.occurredAt),
      amountCents: Math.round((Number(transfer.amount) - Number(transfer.changeAmount)) * 100), category: transfer.reportCategory,
      allocations: transfer.manualTransferAllocations.map(allocation => ({ paymentId: allocation.paymentId, payableId: allocation.payableId, amountCents: Math.round(Number(allocation.amount) * 100) })) })),
  });
}

import { randomUUID } from "node:crypto";
import type { Prisma } from "@pos/db";
import { allocateTransfer } from "../helpers/transfer-allocations";
import { parseAmount } from "../helpers/supplier-payable-input";
import type { ManualExpenseReportCategory } from "../helpers/manual-report-categories";
import { ManualPayableReconciliationError, reconcilePayable } from "./manual-payable-reconciliation";
import { permitSystemPayablePayment } from "./payable-system-payment";

type Scope = { storeId: string; expenseId: string; actorId: string; todayWib: string; authorizeAfterLocks?: () => Promise<void>; authorizeAutomaticCorrection?: () => Promise<void> };
export type ManualTransferAllocationInput = { payableId: string; paymentId: string | null; amount: number };
type LockedTransfer = { id: string; amount: string; date: string; reportCategory: ManualExpenseReportCategory | null };
type LockedDebt = { id: string; amount: string; debtDate: string; dueDate: string | null; reportCategory: ManualExpenseReportCategory | null };

/** Call inside the same transaction that creates or edits the transfer. */
export async function linkTransferAllocations(tx: Prisma.TransactionClient, scope: Scope, input: ManualTransferAllocationInput[]) {
  if (!Array.isArray(input) || input.length > 100) throw new ManualPayableReconciliationError("Periksa daftar alokasi transfer.", 422);
  const [transfer] = await tx.$queryRaw<LockedTransfer[]>`
    SELECT "id", ("amount" - "changeAmount")::text AS "amount",
      (("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date::text AS "date", "reportCategory"
    FROM "pos_expenses" WHERE "id" = ${scope.expenseId} AND "storeId" = ${scope.storeId}
      AND "deletedAt" IS NULL AND "manualPurchasePaymentMethod" = 'TRANSFER'
      AND "goodsPurchaseId" IS NULL AND "shoppingRequestId" IS NULL FOR UPDATE
  `;
  if (!transfer) throw new ManualPayableReconciliationError("Transfer manual tidak ditemukan.", 404);
  let totalCents = 0;
  const requestedPayments = new Set<string>();
  for (const allocation of input) {
    if (!allocation || typeof allocation.payableId !== "string" || !allocation.payableId
      || (allocation.paymentId !== null && (typeof allocation.paymentId !== "string" || !allocation.paymentId))
      || parseAmount(allocation.amount) === null) throw new ManualPayableReconciliationError("Periksa jumlah dan hutang pada alokasi transfer.", 422);
    if (allocation.paymentId && requestedPayments.has(allocation.paymentId)) throw new ManualPayableReconciliationError("Pembayaran yang sama tidak dapat dialokasikan dua kali.", 409);
    if (allocation.paymentId) requestedPayments.add(allocation.paymentId);
    totalCents += Math.round(allocation.amount * 100);
  }
  if (!Number.isSafeInteger(totalCents) || totalCents > Math.round(Number(transfer.amount) * 100)) throw new ManualPayableReconciliationError("Jumlah alokasi melebihi transfer.", 409);

  const previous = await tx.manualTransferAllocation.findMany({ where: { storeId: scope.storeId, expenseId: transfer.id }, select: { payableId: true } });
  const ids = [...new Set([...input.map(row => row.payableId), ...previous.map(row => row.payableId)])].sort();
  const debts = new Map<string, LockedDebt>();
  for (const id of ids) {
    const [debt] = await tx.$queryRaw<LockedDebt[]>`
      SELECT "id", "amount"::text, "debtDate"::text, "dueDate"::text, "reportCategory" FROM "pos_supplier_payables"
      WHERE "id" = ${id} AND "storeId" = ${scope.storeId} AND "goodsPurchaseId" IS NULL FOR UPDATE
    `;
    if (!debt) throw new ManualPayableReconciliationError("Hutang manual tidak ditemukan.", 404);
    debts.set(debt.id, debt);
  }
  await scope.authorizeAfterLocks?.();
  if (previous.length) await tx.manualTransferAllocation.deleteMany({ where: { storeId: scope.storeId, expenseId: transfer.id } });

  const chosen: Array<{ paymentId: string; payableId: string; storeId: string; paidAt: string; amountCents: number; paymentAmountCents: number; category: ManualExpenseReportCategory | null }> = [];
  for (const allocation of input) {
    const debt = debts.get(allocation.payableId)!;
    if (transfer.date < debt.debtDate || transfer.date > scope.todayWib) throw new ManualPayableReconciliationError("Tanggal transfer tidak sesuai dengan tanggal hutang.", 409);
    const reconcileScope = { storeId: scope.storeId, payableId: debt.id, actorId: scope.actorId, todayWib: scope.todayWib };
    let paymentId = allocation.paymentId;
    if (paymentId === `auto:${debt.id}`) paymentId = (await reconcilePayable(tx, reconcileScope)).automaticPaymentId;
    const payments = await tx.supplierPayablePayment.findMany({ where: { payableId: debt.id }, select: {
      id: true, amount: true, paidAt: true, origin: true, transferAllocation: { select: { expenseId: true, amount: true } },
    } });
    let selected: { id: string; amount: unknown; paidAt: Date; transferAllocation: unknown | null } | undefined = payments.find(payment => payment.id === paymentId);
    if (allocation.paymentId === null) {
      const manualCents = payments.filter(payment => payment.origin !== "AUTO").reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0);
      if (manualCents + Math.round(allocation.amount * 100) > Math.round(Number(debt.amount) * 100)) throw new ManualPayableReconciliationError("Pembayaran melebihi sisa hutang.", 409);
      if (debt.dueDate && debt.dueDate <= scope.todayWib && manualCents < Math.round(Number(debt.amount) * 100)) {
        if (!scope.authorizeAutomaticCorrection) throw new ManualPayableReconciliationError("Izin koreksi pembayaran hutang diperlukan.", 403);
        await scope.authorizeAutomaticCorrection();
      }
      const id = randomUUID();
      const paidAt = new Date(`${transfer.date}T00:00:00Z`);
      await permitSystemPayablePayment(tx);
      await tx.supplierPayablePayment.create({ data: { id, payableId: debt.id, amount: allocation.amount, paidAt, createdById: scope.actorId } });
      await reconcilePayable(tx, reconcileScope);
      selected = { id, amount: allocation.amount, paidAt, transferAllocation: null };
    }
    if (!selected || selected.transferAllocation || selected.paidAt.toISOString().slice(0, 10) !== transfer.date) {
      throw new ManualPayableReconciliationError("Pembayaran tidak tersedia atau tanggalnya berbeda dari transfer.", 409);
    }
    chosen.push({ paymentId: selected.id, payableId: debt.id, storeId: scope.storeId, paidAt: transfer.date,
      amountCents: Math.round(allocation.amount * 100), paymentAmountCents: Math.round(Number(selected.amount) * 100), category: debt.reportCategory });
  }
  // Reconciling another payment in this same transfer can reduce or remove an
  // earlier automatic payment. Validate against the locked ledger again.
  for (const allocation of chosen) {
    const payment = await tx.supplierPayablePayment.findFirst({ where: { id: allocation.paymentId, payableId: allocation.payableId },
      select: { amount: true, paidAt: true, transferAllocation: { select: { id: true } } } });
    if (!payment || payment.transferAllocation || payment.paidAt.toISOString().slice(0, 10) !== transfer.date) {
      throw new ManualPayableReconciliationError("Pembayaran hutang berubah. Periksa kembali alokasi transfer.", 409);
    }
    allocation.paymentAmountCents = Math.round(Number(payment.amount) * 100);
  }
  let result: ReturnType<typeof allocateTransfer>;
  try {
    result = allocateTransfer({ storeId: scope.storeId, transfer: { id: transfer.id, storeId: scope.storeId, date: transfer.date,
      amountCents: Math.round(Number(transfer.amount) * 100), category: transfer.reportCategory }, allocations: chosen });
  } catch {
    throw new ManualPayableReconciliationError("Jumlah atau kategori alokasi transfer tidak sesuai. Periksa kembali.", 409);
  }
  for (const allocation of chosen) await tx.manualTransferAllocation.create({ data: { id: randomUUID(), storeId: scope.storeId,
    expenseId: transfer.id, payableId: allocation.payableId, paymentId: allocation.paymentId, amount: allocation.amountCents / 100, createdById: scope.actorId } });
  return { allocated: result.allocatedCents / 100, remaining: result.unallocatedCents / 100 };
}

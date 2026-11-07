import { Prisma } from "@pos/db";
import { randomUUID } from "node:crypto";
import {
  calculateCorrectionTotal,
  planCorrectionPayments,
  summarizeCorrectionPayment,
  type CorrectionPaymentAllocation,
  type CorrectionPaymentSource,
} from "../helpers/shopping-request-correction";
import { loadCorrectionPaymentState } from "./shopping-request-correction-payment-state";
import { readCorrectionPaymentSnapshot } from "./shopping-request-correction-payment-snapshot";
import { resolveCorrectionSchedule } from "./shopping-request-correction-schedule";
import type { CorrectionPaymentSchedule } from "../types/shopping-request-correction";

export type CorrectedFinanceLine = {
  receivedQty: number;
  unitPrice: string;
};

export type CorrectedPurchaseFinance = {
  newTotal: string;
  paid: string;
  remaining: string;
  overpaid: string;
};

/**
 * Calculates the financial view of a corrected purchase without mutating the
 * payment source. The caller persists the source audit before updating the
 * purchase, expense, or payable rows.
 */
export function calculateCorrectedPurchaseFinance(
  lines: CorrectedFinanceLine[],
  paid: string,
): CorrectedPurchaseFinance {
  const newTotal = calculateCorrectionTotal(lines);
  const summary = summarizeCorrectionPayment(newTotal, paid);
  return {
    newTotal,
    paid: new Prisma.Decimal(paid).toFixed(2),
    ...summary,
  };
}

export function buildCorrectionFinancePlan(input: {
  oldTotal: string;
  lines: CorrectedFinanceLine[];
  sources: CorrectionPaymentSource[];
  allocations: CorrectionPaymentAllocation[];
  corrections: CorrectionPaymentSource[];
}) {
  const payments = planCorrectionPayments(input.sources, input.allocations, input.corrections);
  const finance = calculateCorrectedPurchaseFinance(input.lines, payments.paid);
  return {
    oldTotal: new Prisma.Decimal(input.oldTotal).toFixed(2),
    ...finance,
    byMethod: payments.byMethod,
    paymentSnapshot: { sources: payments.sources, allocations: payments.allocations },
  };
}

export async function applyCorrectionFinance(tx: Prisma.TransactionClient, input: {
  storeId: string;
  purchaseId: string;
  correctionId: string;
  actorId: string;
  lines: CorrectedFinanceLine[];
  allocations: CorrectionPaymentAllocation[];
  corrections: CorrectionPaymentSource[];
  method: "TRANSFER" | "GIRO" | null;
  schedule?: CorrectionPaymentSchedule[];
  totalBasis?: "ORDERED" | "RECEIVED";
  dueDate: Date | null;
  businessDate?: string;
  supplierName?: string;
}) {
  const audit = await tx.shoppingRequestCorrection.findFirst({
    where: { id: input.correctionId, storeId: input.storeId, actorId: input.actorId },
    select: { shoppingRequestId: true, afterSnapshot: true },
  });
  if (!audit) throw new Error("Riwayat koreksi tidak tersedia.");

  const state = await loadCorrectionPaymentState(tx, {
    storeId: input.storeId, purchaseId: input.purchaseId, excludeCorrectionId: input.correctionId,
  });
  const purchase = await tx.goodsPurchase.findFirst({
    where: { id: input.purchaseId, storeId: input.storeId, shoppingRequestId: audit.shoppingRequestId, status: "APPROVED" },
    select: { id: true, shoppingRequestId: true, number: true, totalAmount: true, paymentMethod: true, supplierNameSnapshot: true,
      payments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, method: true, amount: true, dueDate: true, note: true } },
      expense: { select: { id: true, storeId: true, deletedAt: true, occurredAt: true } }, shoppingRequest: { select: { expense: { select: { id: true, storeId: true, deletedAt: true, occurredAt: true } } } }, supplierPayable: { select: { id: true, storeId: true } } },
  });
  if (!purchase) throw new Error("Pembelian tidak tersedia.");
  let expense = purchase.expense ?? purchase.shoppingRequest?.expense;
  if (expense && (expense.deletedAt || expense.storeId !== input.storeId)) throw new Error("Pengeluaran pembelian tidak tersedia di toko ini.");
  if (purchase.supplierPayable && purchase.supplierPayable.storeId !== input.storeId) throw new Error("Utang pembelian tidak tersedia di toko ini.");

  const plan = buildCorrectionFinancePlan({
    oldTotal: purchase.totalAmount.toFixed(2), lines: input.lines,
    sources: state.sources, allocations: input.allocations, corrections: input.corrections,
  });
  const savedSnapshot = readCorrectionPaymentSnapshot(audit.afterSnapshot);
  const sourceKeys = (sources: CorrectionPaymentSource[]) => sources
    .map((source) => JSON.stringify([source.sourceKind, source.paymentId, source.amount, source.paidAt])).sort();
  const allocationKeys = (allocations: CorrectionPaymentAllocation[]) => allocations
    .map((allocation) => JSON.stringify([allocation.sourceKind, allocation.paymentId, allocation.method, allocation.amount])).sort();
  if (JSON.stringify(sourceKeys(savedSnapshot.sources)) !== JSON.stringify(sourceKeys(plan.paymentSnapshot.sources)) ||
      JSON.stringify(allocationKeys(savedSnapshot.allocations)) !== JSON.stringify(allocationKeys(plan.paymentSnapshot.allocations))) {
    throw new Error("Riwayat pembayaran berubah. Muat ulang dan coba lagi.");
  }
  if (await tx.shoppingRequestCorrectionAllocation.count({ where: { correctionId: input.correctionId } })) {
    throw new Error("Alokasi pembayaran koreksi sudah tersimpan.");
  }
  const sources = new Map(plan.paymentSnapshot.sources.map((source) => [JSON.stringify([source.sourceKind, source.paymentId]), source]));
  if (plan.paymentSnapshot.allocations.length) {
    await tx.shoppingRequestCorrectionAllocation.createMany({ data: plan.paymentSnapshot.allocations.map((allocation) => {
      const source = sources.get(JSON.stringify([allocation.sourceKind, allocation.paymentId]));
      if (!source) throw new Error("Sumber pembayaran tidak tersedia.");
      return { correctionId: input.correctionId, ...allocation, sourceAmount: source.amount, paidAt: new Date(`${source.paidAt}T00:00:00.000Z`), details: {} };
    }) });
  }
  const schedule = resolveCorrectionSchedule({ total: plan.newTotal, schedule: input.schedule,
    previous: purchase.payments.map(row => ({ ...row, amount: row.amount.toFixed(2), dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null })),
    method: input.method, dueDate: input.dueDate?.toISOString().slice(0, 10) ?? null });
  const method = schedule.length && schedule.every(row => row.method === schedule[0].method) ? schedule[0].method : null;
  const dueDate = schedule.filter(row => row.method === "GIRO").map(row => row.dueDate!).sort()[0];
  const paymentDueDate = dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : null;
  for (const [index, row] of schedule.entries()) {
    const data = { method: row.method, amount: row.amount, note: row.note, dueDate: row.dueDate ? new Date(`${row.dueDate}T00:00:00.000Z`) : null };
    if (purchase.payments[index]) await tx.goodsPurchasePayment.update({ where: { id: purchase.payments[index].id }, data });
    else await tx.goodsPurchasePayment.create({ data: { ...data, goodsPurchaseId: purchase.id, createdById: input.actorId } });
  }
  if (purchase.payments.length > schedule.length) await tx.goodsPurchasePayment.deleteMany({ where: { goodsPurchaseId: purchase.id, id: { in: purchase.payments.slice(schedule.length).map(row => row.id) } } });
  await tx.goodsPurchase.update({ where: { id: purchase.id }, data: { totalAmount: plan.newTotal, totalBasis: input.totalBasis ?? "RECEIVED", paymentMethod: method, paymentDueDate } });
  if (!expense && input.totalBasis === "ORDERED") return plan;
  if (!expense) {
    // A synthetic receipt establishes cost, never evidence that cash changed hands.
    await tx.goodsPurchase.update({ where: { id: purchase.id }, data: { initialTransferAmount: "0.00", initialTransferPaidAt: null } });
    expense = await tx.expense.create({ data: { storeId: input.storeId, recordedById: input.actorId,
      goodsPurchaseId: purchase.id, shoppingRequestId: purchase.shoppingRequestId, applicantName: input.supplierName ?? purchase.supplierNameSnapshot,
      category: "SUPPLIES", description: `Koreksi pembelian ${purchase.number}`, amount: plan.newTotal, changeAmount: 0,
      occurredAt: input.businessDate ? new Date(`${input.businessDate}T00:00:00.000Z`) : new Date(), hasMissingCostSnapshot: false },
      select: { id: true, storeId: true, deletedAt: true, occurredAt: true } });
  }
  const currentExpenseDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(expense.occurredAt);
  const shiftedOccurredAt = input.businessDate
    ? new Date(expense.occurredAt.getTime() + Date.parse(`${input.businessDate}T00:00:00.000Z`) - Date.parse(`${currentExpenseDate}T00:00:00.000Z`))
    : undefined;
  const updatedExpense = await tx.expense.updateMany({ where: { id: expense.id, storeId: input.storeId, deletedAt: null }, data: {
    amount: plan.newTotal, ...(shiftedOccurredAt ? { occurredAt: shiftedOccurredAt } : {}),
    ...(input.supplierName !== undefined ? { applicantName: input.supplierName } : {}),
  } });
  if (updatedExpense.count !== 1) throw new Error("Pengeluaran pembelian berubah. Muat ulang dan coba lagi.");
  if (purchase.supplierPayable) {
    const updatedPayable = await tx.supplierPayable.updateMany({ where: { id: purchase.supplierPayable.id, storeId: input.storeId, goodsPurchaseId: purchase.id }, data: {
      amount: plan.newTotal, dueDate: paymentDueDate,
      ...(input.businessDate ? { debtDate: new Date(`${input.businessDate}T00:00:00.000Z`) } : {}),
      ...(input.supplierName !== undefined ? { supplierName: input.supplierName } : {}),
    } });
    if (updatedPayable.count !== 1) throw new Error("Utang pembelian berubah. Muat ulang dan coba lagi.");
  } else if (schedule.some(row => row.method === "GIRO")) {
    const debtDate = input.businessDate ?? currentExpenseDate;
    await tx.supplierPayable.create({ data: { id: randomUUID(), storeId: input.storeId, goodsPurchaseId: purchase.id, supplierName: input.supplierName ?? purchase.supplierNameSnapshot, amount: plan.newTotal, debtDate: new Date(`${debtDate}T00:00:00.000Z`), dueDate: paymentDueDate, giroHistoryVerifiedAt: new Date(), createdById: input.actorId } });
  }
  return plan;
}

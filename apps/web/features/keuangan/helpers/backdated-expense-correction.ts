import { z } from "zod";
import { calculateBackdatedRecognition } from "@/features/suppliers/backdated-purchases/helpers/backdated-purchase-accounting";
import type { ExpenseCorrectionOperation } from "./expense-correction-contract";
import type { ExpensePaymentToSettle } from "./expense-correction-settlement";

export type BackdatedCorrectionPurchase = {
  id: string;
  reference: string;
  purchaseDate: string;
  dueDate: string;
  paymentMethod: "GIRO" | "TRANSFER";
  amountCents: number;
  payments: ExpensePaymentToSettle[];
};

const amount = z.number().int().positive().max(999_999_999_999);
const purchaseChanges = z.strictObject({
  reference: z.string().trim().min(1).max(160).optional(),
  purchaseDate: z.iso.date().optional(),
  dueDate: z.iso.date().optional(),
  amountCents: amount.optional(),
});
const paymentChanges = z.strictObject({
  amountCents: amount.optional(),
  paidAt: z.iso.date().optional(),
});

function summarize(purchase: BackdatedCorrectionPurchase) {
  const { paidCents, remainingCents, dueCents } = calculateBackdatedRecognition(purchase);
  return { ...purchase, paidCents, remainingCents, dueCents, cancelled: false };
}

export function planBackdatedExpenseCorrection(
  purchase: BackdatedCorrectionPurchase,
  paymentId: string | undefined,
  operation: ExpenseCorrectionOperation,
  changes: Record<string, unknown> | undefined,
  today: string,
) {
  const before = summarize(purchase);
  const payment = paymentId ? purchase.payments.find(entry => entry.id === paymentId) : undefined;
  if (paymentId && !payment) throw new Error("Pembayaran belanja terdahulu tidak ditemukan.");

  if (operation === "cancel") {
    if (payment) {
      const payments = purchase.payments.filter(entry => entry.id !== payment.id);
      return { before, after: summarize({ ...purchase, payments }), paymentsToSettle: [payment] };
    }
    return {
      before,
      after: { ...before, amountCents: 0, paidCents: 0, remainingCents: 0, dueCents: 0, payments: [], cancelled: true },
      paymentsToSettle: purchase.payments,
    };
  }

  let updated: BackdatedCorrectionPurchase;
  if (payment) {
    const result = paymentChanges.safeParse(changes);
    if (!result.success) throw new Error("Periksa nominal dan tanggal pembayaran.");
    const editedPayment = {
      ...payment,
      amountCents: result.data.amountCents ?? payment.amountCents,
      paidAt: result.data.paidAt ?? payment.paidAt,
    };
    updated = { ...purchase, payments: purchase.payments.map(entry => entry.id === payment.id ? editedPayment : entry) };
  } else {
    const result = purchaseChanges.safeParse(changes);
    if (!result.success) throw new Error("Periksa referensi, nominal, dan tanggal pembelian.");
    const purchaseDate = result.data.purchaseDate ?? purchase.purchaseDate;
    updated = {
      ...purchase,
      reference: result.data.reference ?? purchase.reference,
      purchaseDate,
      dueDate: purchase.paymentMethod === "TRANSFER" ? purchaseDate : result.data.dueDate ?? purchase.dueDate,
      amountCents: result.data.amountCents ?? purchase.amountCents,
    };
  }
  if (updated.purchaseDate > today || updated.dueDate < updated.purchaseDate ||
      updated.payments.some(entry => entry.paidAt < updated.purchaseDate || entry.paidAt > today)) {
    throw new Error("Periksa urutan tanggal pembelian, pembayaran, dan jatuh tempo.");
  }
  return { before, after: summarize(updated), paymentsToSettle: [] };
}

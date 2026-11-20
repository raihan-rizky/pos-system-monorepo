import { db } from "@pos/db";
import { BackdatedPurchaseError } from "@/features/suppliers/backdated-purchases/repositories/backdated-purchase-repository";
import { ShoppingRequestCorrectionError } from "@/features/suppliers/shopping-requests/services/shopping-request-correction-error";
import type { ShoppingRequestActor } from "@/features/suppliers/shopping-requests/types/shopping-request";
import type { ExpenseCorrectionOperation, ExpenseCorrectionSubject } from "../helpers/expense-correction-contract";
import type { ExpenseCorrectionConfirmationInput, ExpenseCorrectionPreviewInput } from "../helpers/expense-correction-input";
import {
  commitBackdatedExpenseCorrection,
  previewBackdatedExpenseCorrection,
} from "../repositories/backdated-expense-correction-repository";
import { commitGoodsExpenseCancellation, previewGoodsExpenseCancellation } from "../repositories/goods-expense-cancellation";
import { commitGoodsExpenseEdit, loadGoodsExpenseEditor, previewGoodsExpenseEdit } from "../repositories/goods-expense-edit-repository";

export async function loadExpenseCorrectionEditor(
  subject: ExpenseCorrectionSubject,
  operation: ExpenseCorrectionOperation,
  actor: ShoppingRequestActor,
) {
  if (subject.type === "BACKDATED_PURCHASE") {
    const { impact } = await previewBackdatedExpenseCorrection(
      { subject, operation: "cancel", draft: { reason: "", dispositions: [] } }, actor,
    );
    const suppliers = operation === "cancel" && impact.paymentsToSettle.length ? await db.supplier.findMany({
      where: { isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true },
    }) : [];
    const payment = subject.payment ? impact.before.payments.find(entry => entry.id === subject.payment?.id) : undefined;
    if (subject.payment && !payment) throw new BackdatedPurchaseError("Pembayaran belanja terdahulu tidak ditemukan.", 404);
    return { kind: "backdated" as const, editor: impact.before, payment, payments: impact.paymentsToSettle, suppliers };
  }

  const editor = await loadGoodsExpenseEditor(subject, actor);
  const paymentSubject = subject.type === "GOODS_PURCHASE" ? subject.payment : undefined;
  const payments = editor.payment.sources.filter(entry => Number(entry.amount) > 0).map(entry => ({
    id: entry.paymentId, amountCents: Math.round(Number(entry.amount) * 100), paidAt: entry.paidAt,
    kind: entry.sourceKind === "TRANSFER_EXPENSE" ? "GOODS_INITIAL_TRANSFER" : "SUPPLIER_PAYABLE_PAYMENT",
  }));
  const payment = paymentSubject ? payments.find(entry => entry.kind === paymentSubject.kind &&
    (entry.kind === "GOODS_INITIAL_TRANSFER" ? paymentSubject.id === editor.purchaseId : entry.id === paymentSubject.id)) : undefined;
  if (paymentSubject && !payment) throw new ShoppingRequestCorrectionError("Pembayaran aktif tidak ditemukan.", 404);
  const supplier = editor.header.supplierId ? await db.supplier.findUnique({
    where: { id: editor.header.supplierId }, select: { id: true, name: true },
  }) : null;
  return { kind: "goods" as const, editor, payment, payments: payment ? [payment] : payments, suppliers: supplier ? [supplier] : [] };
}

export function previewExpenseCorrection(input: ExpenseCorrectionPreviewInput, actor: ShoppingRequestActor) {
  if (input.subject.type === "BACKDATED_PURCHASE") return previewBackdatedExpenseCorrection(input, actor);
  return input.operation === "cancel" ? previewGoodsExpenseCancellation(input, actor) : previewGoodsExpenseEdit(input, actor);
}

export function commitExpenseCorrection(input: ExpenseCorrectionConfirmationInput, actor: ShoppingRequestActor) {
  if (input.subject.type === "BACKDATED_PURCHASE") return commitBackdatedExpenseCorrection(input, actor);
  return input.operation === "cancel" ? commitGoodsExpenseCancellation(input, actor) : commitGoodsExpenseEdit(input, actor);
}

import { db, type Prisma } from "@pos/db";
import {
  cancelGoodsPurchaseWithStock,
  cancelShoppingRequestWithStock,
  previewGoodsPurchaseStockCancellation,
  previewShoppingRequestStockCancellation,
} from "@/features/suppliers/shopping-requests/repositories/shopping-request-deletion-repository";
import { planShoppingRequestCorrection } from "@/features/suppliers/shopping-requests/repositories/shopping-request-correction-plan";
import { commitShoppingRequestCorrectionRecord } from "@/features/suppliers/shopping-requests/repositories/shopping-request-correction-repository";
import { ShoppingRequestCorrectionError } from "@/features/suppliers/shopping-requests/services/shopping-request-correction-error";
import { ShoppingRequestDeletionError } from "@/features/suppliers/shopping-requests/services/shopping-request-deletion-error";
import type { ShoppingRequestActor } from "@/features/suppliers/shopping-requests/types/shopping-request";
import type { ExpenseCorrectionConfirmationInput, ExpenseCorrectionPreviewInput } from "../helpers/expense-correction-input";
import { planExpensePaymentSettlement } from "../helpers/expense-correction-settlement";
import { buildGoodsExpensePaymentCorrection } from "../helpers/goods-expense-payment-correction";
import { fingerprint, loadEditor } from "./goods-expense-edit-repository";

const jakartaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
});

async function prepare(
  tx: Prisma.TransactionClient,
  input: ExpenseCorrectionPreviewInput,
  actor: ShoppingRequestActor,
  now: Date,
) {
  const { subject, draft } = input;
  if (subject.type === "BACKDATED_PURCHASE" || input.operation !== "cancel") {
    throw new ShoppingRequestCorrectionError("Jenis pembatalan tidak sesuai.", 422);
  }
  const editor = await loadEditor(tx, subject, actor.storeId);
  const payment = subject.type === "GOODS_PURCHASE" ? subject.payment : undefined;
  const today = jakartaDate.format(now);
  const allPayments = editor.payment.sources.filter(source => Number(source.amount) > 0).map(source => ({
    id: source.paymentId, amountCents: Math.round(Number(source.amount) * 100), paidAt: source.paidAt,
    kind: source.sourceKind === "TRANSFER_EXPENSE" ? "GOODS_INITIAL_TRANSFER" as const : "SUPPLIER_PAYABLE_PAYMENT" as const,
  }));
  let paymentCorrection: { data: ReturnType<typeof buildGoodsExpensePaymentCorrection>; version: string } | undefined;
  let paymentsToSettle = allPayments;
  let stockMovements: Awaited<ReturnType<typeof previewShoppingRequestStockCancellation>> = [];
  let stockBlocker: string | undefined;
  if (payment) {
    let data;
    try {
      data = buildGoodsExpensePaymentCorrection({
        editor, payment, operation: "cancel", reason: draft.reason, today,
        key: fingerprint({ subject, reason: draft.reason, editorVersion: editor.version }),
      });
    } catch (error) {
      throw new ShoppingRequestCorrectionError(error instanceof Error ? error.message : "Pembayaran tidak tersedia.", 422);
    }
    paymentsToSettle = allPayments.filter(entry => entry.id === data.payment.corrections[0].paymentId &&
      entry.kind === payment.kind);
    const { preview } = await planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: editor.requestId, data });
    paymentCorrection = { data, version: preview.version };
  } else {
    try {
      stockMovements = subject.type === "GOODS_PURCHASE"
        ? (await previewGoodsPurchaseStockCancellation(tx, editor.requestId, editor.purchaseId, actor.storeId)).movements
        : await previewShoppingRequestStockCancellation(tx, editor.requestId, actor.storeId);
    } catch (error) {
      if (!(error instanceof ShoppingRequestDeletionError) || error.status !== 409) throw error;
      stockBlocker = error.message;
    }
  }
  const settlements = planExpensePaymentSettlement(paymentsToSettle, draft.dispositions, today);
  for (const disposition of draft.dispositions) {
    if (disposition.kind === "credit" && disposition.supplierId !== editor.header.supplierId) {
      settlements.blockers.push({
        paymentId: disposition.paymentId, remainingCents: disposition.amountCents,
        message: "Kredit harus berasal dari pemasok pembelian yang sama.",
      });
    }
  }
  const blockers = [
    ...settlements.blockers,
    ...(stockBlocker ? [{ message: stockBlocker }] : []),
  ];
  const amountCents = Math.round(Number(editor.totalAmount) * 100);
  const paidCents = allPayments.reduce((sum, entry) => sum + entry.amountCents, 0);
  const appliedCredit = await tx.expenseSupplierCreditApplication.aggregate({
    where: { storeId: actor.storeId, payable: { goodsPurchaseId: editor.purchaseId }, releasedAt: null },
    _sum: { amount: true },
  });
  const creditCents = Math.round(Number(appliedCredit._sum.amount ?? 0) * 100);
  const paidAfter = payment ? paidCents - paymentsToSettle.reduce((sum, entry) => sum + entry.amountCents, 0) : 0;
  const before = { amountCents, paidCents, creditCents, remainingCents: Math.max(0, amountCents - paidCents - creditCents), payments: allPayments };
  const after = {
    amountCents: payment ? amountCents : 0, paidCents: paidAfter,
    creditCents: payment ? creditCents : 0,
    remainingCents: payment ? Math.max(0, amountCents - paidAfter - creditCents) : 0,
  };
  const version = fingerprint({ subject, draft, editorVersion: editor.version, creditCents, stockMovements, blockers, paymentVersion: paymentCorrection?.version });
  return { editor, payment, paymentCorrection, review: { version, blockers, impact: { before, after, paymentsToSettle, stockMovements, settlements } } };
}

export function previewGoodsExpenseCancellation(input: ExpenseCorrectionPreviewInput, actor: ShoppingRequestActor, now = new Date()) {
  return db.$transaction(async tx => (await prepare(tx, input, actor, now)).review, { timeout: 30_000 });
}

export function commitGoodsExpenseCancellation(input: ExpenseCorrectionConfirmationInput, actor: ShoppingRequestActor, now = new Date()) {
  const inputHash = fingerprint(input);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "pos_stores" WHERE "id" = ${actor.storeId} FOR UPDATE`;
    const existing = await tx.expenseCorrection.findUnique({
      where: { storeId_requestId: { storeId: actor.storeId, requestId: input.requestId } },
    });
    if (existing) {
      if (existing.inputHash !== inputHash) throw new ShoppingRequestCorrectionError("Nomor permintaan sudah digunakan untuk koreksi berbeda.", 409);
      return { auditId: existing.id };
    }
    const { subject, draft } = input;
    const { editor, payment, paymentCorrection, review } = await prepare(tx, input, actor, now);
    if (review.version !== input.version) throw new ShoppingRequestCorrectionError("Data berubah sejak pratinjau. Tinjau kembali koreksi ini.", 409);
    if (review.blockers.length) throw new ShoppingRequestCorrectionError(review.blockers[0].message, 409);
    if (paymentCorrection) {
      await commitShoppingRequestCorrectionRecord(tx, {
        actor, requestId: editor.requestId, data: { ...paymentCorrection.data, expectedPreviewVersion: paymentCorrection.version },
      });
    } else if (subject.type === "GOODS_PURCHASE") {
      await cancelGoodsPurchaseWithStock(tx, editor.requestId, editor.purchaseId, draft.reason, actor, now);
    } else {
      await cancelShoppingRequestWithStock(tx, editor.requestId, draft.reason, actor, now);
    }
    if (!paymentCorrection) {
      if (review.impact.before.creditCents > 0) {
        await tx.expenseSupplierCreditApplication.updateMany({
          where: { storeId: actor.storeId, payable: { goodsPurchaseId: editor.purchaseId }, releasedAt: null },
          data: { releasedAt: now },
        });
      }
      const retired = await tx.expense.updateMany({
        where: {
          storeId: actor.storeId, deletedAt: null,
          ...(subject.type === "GOODS_PURCHASE" ? { goodsPurchaseId: editor.purchaseId } : {
            OR: [{ shoppingRequestId: editor.requestId }, { goodsPurchase: { shoppingRequestId: editor.requestId } }],
          }),
        },
        data: { deletedAt: now },
      });
      if (subject.type === "GOODS_PURCHASE" && retired.count === 0) {
        await tx.expense.updateMany({
          where: {
            storeId: actor.storeId, deletedAt: null, goodsPurchaseId: null,
            shoppingRequestId: editor.requestId, amount: editor.totalAmount, changeAmount: 0,
            shoppingRequest: { goodsPurchases: { none: {
              id: { not: editor.purchaseId }, storeId: actor.storeId, totalAmount: editor.totalAmount,
              OR: [{ status: "APPROVED" }, { status: "CANCELLED", statusBeforeCancellation: "APPROVED" }],
            } } },
          },
          data: { deletedAt: now },
        });
      }
    }
    const settlements = draft.dispositions.map(disposition => {
      const paymentKind = review.impact.paymentsToSettle.find(entry => entry.id === disposition.paymentId)!.kind;
      const details = {
        paymentKind, paymentId: disposition.paymentId, amount: (disposition.amountCents / 100).toFixed(2),
        reference: disposition.reference,
      };
      switch (disposition.kind) {
        case "credit": return { ...details, kind: "CREDIT" as const, supplierId: disposition.supplierId };
        case "refund": return { ...details, kind: "REFUND" as const, receivedAt: new Date(`${disposition.date}T00:00:00Z`) };
        case "entryError": return { ...details, kind: "ENTRY_ERROR" as const };
      }
    });
    const audit = await tx.expenseCorrection.create({
      data: {
        storeId: actor.storeId, requestId: input.requestId, actorId: actor.id, actorName: actor.name ?? actor.id,
        action: "CANCEL", subjectKind: subject.type, subjectId: subject.id,
        paymentKind: payment?.kind, paymentId: payment?.id,
        reason: draft.reason, version: input.version, inputHash,
        before: { ...review.impact.before, purchaseId: editor.purchaseId },
        after: review.impact.after, settlements: { create: settlements },
      },
      select: { id: true },
    });
    return { auditId: audit.id };
  }, { timeout: 60_000 });
}

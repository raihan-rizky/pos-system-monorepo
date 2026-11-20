import { createHash } from "node:crypto";
import { db, type Prisma } from "@pos/db";
import { parseShoppingRequestCorrection } from "@/features/suppliers/shopping-requests/helpers/shopping-request-correction-input";
import { loadShoppingRequestCorrectionEditor } from "@/features/suppliers/shopping-requests/repositories/shopping-request-correction-editor";
import { planShoppingRequestCorrection } from "@/features/suppliers/shopping-requests/repositories/shopping-request-correction-plan";
import { commitShoppingRequestCorrectionRecord } from "@/features/suppliers/shopping-requests/repositories/shopping-request-correction-repository";
import { ShoppingRequestCorrectionError } from "@/features/suppliers/shopping-requests/services/shopping-request-correction-error";
import type { ShoppingRequestActor } from "@/features/suppliers/shopping-requests/types/shopping-request";
import type { ShoppingRequestCorrectionInput } from "@/features/suppliers/shopping-requests/types/shopping-request-correction";
import type { ExpenseCorrectionSubject } from "../helpers/expense-correction-contract";
import type { ExpenseCorrectionConfirmationInput, ExpenseCorrectionPreviewInput } from "../helpers/expense-correction-input";
import { buildGoodsExpensePaymentCorrection } from "../helpers/goods-expense-payment-correction";

const jakartaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
});

export function fingerprint(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, entry) => !entry || typeof entry !== "object" || Array.isArray(entry)
    ? entry
    : Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))));
  return createHash("sha256").update(canonical).digest("hex");
}

export async function loadEditor(tx: Prisma.TransactionClient, subject: ExpenseCorrectionSubject, storeId: string) {
  if (subject.type === "BACKDATED_PURCHASE") {
    throw new ShoppingRequestCorrectionError("Jenis pembelian tidak sesuai.", 422);
  }
  let requestId = subject.id;
  if (subject.type === "GOODS_PURCHASE") {
    const purchase = await tx.goodsPurchase.findFirst({
      where: { id: subject.id, storeId, status: "APPROVED" },
      select: { shoppingRequestId: true },
    });
    if (!purchase) throw new ShoppingRequestCorrectionError("Pembelian Barang aktif tidak ditemukan.", 404);
    requestId = purchase.shoppingRequestId;
  }
  const editor = await loadShoppingRequestCorrectionEditor(tx, { storeId, requestId });
  if (subject.type === "GOODS_PURCHASE" && editor.purchaseId !== subject.id) {
    throw new ShoppingRequestCorrectionError("Pembelian terkait telah berubah. Muat ulang daftar pengeluaran.", 409);
  }
  return editor;
}

export function loadGoodsExpenseEditor(subject: ExpenseCorrectionSubject, actor: ShoppingRequestActor) {
  return db.$transaction(tx => loadEditor(tx, subject, actor.storeId), { timeout: 15_000 });
}

async function prepare(
  tx: Prisma.TransactionClient,
  input: ExpenseCorrectionPreviewInput,
  actor: ShoppingRequestActor,
  now: Date,
) {
  const { subject, draft } = input;
  if (input.operation !== "edit" || draft.dispositions.length > 0) {
    throw new ShoppingRequestCorrectionError("Data ubah pembelian tidak sesuai.", 422);
  }
  const editor = await loadEditor(tx, subject, actor.storeId);
  const payment = subject.type === "GOODS_PURCHASE" ? subject.payment : undefined;
  const key = fingerprint({ subject, draft, editorVersion: editor.version });
  let data: ShoppingRequestCorrectionInput;
  try {
    data = payment ? buildGoodsExpensePaymentCorrection({
      editor, payment, operation: "edit", changes: draft.changes, reason: draft.reason, key, today: jakartaDate.format(now),
    }) : parseShoppingRequestCorrection({
      ...draft.changes, idempotencyKey: key, reason: draft.reason, catalog: [],
    });
  } catch (error) {
    const message = payment && error instanceof Error ? error.message : "Periksa data pembelian yang diubah.";
    throw new ShoppingRequestCorrectionError(message, 422);
  }
  if (!payment && data.payment.corrections.length) {
    throw new ShoppingRequestCorrectionError("Gunakan aksi Ubah pembayaran untuk mengoreksi pembayaran tercatat.", 422);
  }
  const { preview, editor: verifiedEditor } = await planShoppingRequestCorrection(tx, {
    storeId: actor.storeId, requestId: editor.requestId, data,
  });
  if (verifiedEditor.purchaseId !== editor.purchaseId) {
    throw new ShoppingRequestCorrectionError("Pembelian terkait berubah. Tinjau kembali pengeluaran.", 409);
  }
  const beforeCents = Math.round(Number(preview.oldTotal) * 100);
  const afterCents = Math.round(Number(preview.newTotal) * 100);
  const paidBefore = editor.payment.sources.reduce((sum, entry) => sum + Math.round(Number(entry.amount) * 100), 0);
  const paidAfter = Math.round(Number(preview.paid) * 100);
  return {
    editor, data,
    review: {
      version: preview.version,
      blockers: [],
      impact: {
        before: { amountCents: beforeCents, paidCents: paidBefore, remainingCents: Math.max(0, beforeCents - paidBefore) },
        after: { amountCents: afterCents, paidCents: paidAfter, remainingCents: Math.max(0, afterCents - paidAfter) },
        stockMovements: preview.stock,
        changes: preview.changes,
        paymentsToSettle: [],
      },
    },
  };
}

export function previewGoodsExpenseEdit(input: ExpenseCorrectionPreviewInput, actor: ShoppingRequestActor, now = new Date()) {
  return db.$transaction(async tx => (await prepare(tx, input, actor, now)).review, { timeout: 15_000 });
}

export function commitGoodsExpenseEdit(input: ExpenseCorrectionConfirmationInput, actor: ShoppingRequestActor, now = new Date()) {
  const { subject } = input;
  const inputHash = fingerprint(input);
  return db.$transaction(async tx => {
    // Match the source correction's store-first locking order.
    await tx.$queryRaw`SELECT "id" FROM "pos_stores" WHERE "id" = ${actor.storeId} FOR UPDATE`;
    const existing = await tx.expenseCorrection.findUnique({
      where: { storeId_requestId: { storeId: actor.storeId, requestId: input.requestId } },
    });
    if (existing) {
      if (existing.inputHash !== inputHash) {
        throw new ShoppingRequestCorrectionError("Nomor permintaan sudah digunakan untuk koreksi berbeda.", 409);
      }
      return { auditId: existing.id };
    }
    const { editor, data, review } = await prepare(tx, input, actor, now);
    if (review.version !== input.version) {
      throw new ShoppingRequestCorrectionError("Data berubah sejak pratinjau. Tinjau kembali koreksi ini.", 409);
    }
    const result = await commitShoppingRequestCorrectionRecord(tx, {
      actor, requestId: editor.requestId, data: { ...data, expectedPreviewVersion: input.version },
    });
    const payment = subject.type === "GOODS_PURCHASE" ? subject.payment : undefined;
    const audit = await tx.expenseCorrection.create({
      data: {
        storeId: actor.storeId, requestId: input.requestId, actorId: actor.id, actorName: actor.name ?? actor.id,
        action: "EDIT", subjectKind: subject.type, subjectId: subject.id,
        paymentKind: payment?.kind, paymentId: payment?.id,
        reason: input.draft.reason, version: input.version, inputHash,
        before: review.impact.before,
        after: { ...review.impact.after, sourceCorrectionId: result.correctionId },
      },
      select: { id: true },
    });
    return { auditId: audit.id };
  }, { timeout: 60_000 });
}

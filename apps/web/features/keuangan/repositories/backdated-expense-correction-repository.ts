import { createHash } from "node:crypto";
import { db, type Prisma } from "@pos/db";
import {
  BackdatedPurchaseError,
  syncBackdatedPurchaseCorrectionExpenses,
  type BackdatedPurchaseActor,
} from "@/features/suppliers/backdated-purchases/repositories/backdated-purchase-repository";
import { planBackdatedExpenseCorrection } from "../helpers/backdated-expense-correction";
import type { ExpenseCorrectionConfirmationInput, ExpenseCorrectionPreviewInput } from "../helpers/expense-correction-input";
import { planExpensePaymentSettlement, type ExpensePaymentDisposition } from "../helpers/expense-correction-settlement";

const jakartaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
});

function hash(value: unknown): string {
  const json = JSON.stringify(value, (_key, entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)));
  });
  return createHash("sha256").update(json).digest("hex");
}

function decimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function settlementData(disposition: ExpensePaymentDisposition) {
  const data = {
    paymentKind: "BACKDATED_PAYMENT" as const, paymentId: disposition.paymentId,
    amount: decimal(disposition.amountCents), reference: disposition.reference,
  };
  switch (disposition.kind) {
    case "refund": return { ...data, kind: "REFUND" as const, receivedAt: utcDate(disposition.date) };
    case "credit": return { ...data, kind: "CREDIT" as const, supplierId: disposition.supplierId };
    case "entryError": return { ...data, kind: "ENTRY_ERROR" as const };
  }
}

async function prepare(
  tx: Prisma.TransactionClient,
  input: ExpenseCorrectionPreviewInput,
  actor: BackdatedPurchaseActor,
  now: Date,
) {
  if (input.subject.type !== "BACKDATED_PURCHASE") {
    throw new BackdatedPurchaseError("Jenis pengeluaran tidak sesuai.", 422);
  }
  const subject = input.subject;
  const purchase = await tx.backdatedPurchase.findFirst({
    where: { id: subject.id, storeId: actor.storeId, cancelledAt: null },
    include: { payments: { where: { cancelledAt: null }, orderBy: [{ paidAt: "asc" }, { id: "asc" }] } },
  });
  if (!purchase) throw new BackdatedPurchaseError("Belanja terdahulu aktif tidak ditemukan.", 404);
  if (subject.payment && !purchase.payments.some(payment => payment.id === subject.payment?.id)) {
    throw new BackdatedPurchaseError("Pembayaran belanja terdahulu tidak ditemukan.", 404);
  }
  const active = {
    id: purchase.id, reference: purchase.reference, purchaseDate: day(purchase.purchaseDate),
    dueDate: day(purchase.dueDate), paymentMethod: purchase.paymentMethod, amountCents: purchase.amount.mul(100).toNumber(),
    payments: purchase.payments.map(payment => ({
      id: payment.id, amountCents: payment.amount.mul(100).toNumber(), paidAt: day(payment.paidAt),
    })),
  };
  const today = jakartaDate.format(now);
  let plan: ReturnType<typeof planBackdatedExpenseCorrection>;
  try {
    plan = planBackdatedExpenseCorrection(active, subject.payment?.id, input.operation, input.draft.changes, today);
  } catch (error) {
    throw new BackdatedPurchaseError(error instanceof Error ? error.message : "Periksa isi koreksi.", 422);
  }
  const settlements = planExpensePaymentSettlement(plan.paymentsToSettle, input.draft.dispositions, today);
  const credits = input.draft.dispositions.filter(disposition => disposition.kind === "credit");
  if (credits.length) {
    const suppliers = await tx.supplier.findMany({
      where: { id: { in: credits.map(credit => credit.supplierId) }, isActive: true }, select: { id: true },
    });
    const supplierIds = new Set(suppliers.map(supplier => supplier.id));
    for (const credit of credits) {
      if (!supplierIds.has(credit.supplierId)) {
        settlements.blockers.push({ paymentId: credit.paymentId, remainingCents: credit.amountCents, message: "Pemasok kredit sudah tidak tersedia." });
      }
    }
  }
  return {
    subject,
    version: hash({ active, subject, operation: input.operation, draft: input.draft }),
    blockers: settlements.blockers,
    impact: { ...plan, settlements, stockMovements: [] },
  };
}

export function previewBackdatedExpenseCorrection(
  input: ExpenseCorrectionPreviewInput,
  actor: BackdatedPurchaseActor,
  now = new Date(),
) {
  return db.$transaction(tx => prepare(tx, input, actor, now), { isolationLevel: "RepeatableRead" });
}

export async function commitBackdatedExpenseCorrection(
  input: ExpenseCorrectionConfirmationInput,
  actor: BackdatedPurchaseActor,
  now = new Date(),
) {
  if (input.subject.type !== "BACKDATED_PURCHASE") {
    throw new BackdatedPurchaseError("Jenis pengeluaran tidak sesuai.", 422);
  }
  const purchaseId = input.subject.id;
  const inputHash = hash(input);
  const requestKey = { storeId_requestId: { storeId: actor.storeId, requestId: input.requestId } };
  const replay = (existing: { id: string; inputHash: string }) => {
    if (existing.inputHash !== inputHash) {
      throw new BackdatedPurchaseError("Nomor permintaan sudah digunakan untuk koreksi berbeda.", 409);
    }
    return { auditId: existing.id };
  };

  try {
    return await db.$transaction(async tx => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "pos_backdated_purchases"
        WHERE "id" = ${purchaseId} AND "storeId" = ${actor.storeId}
        FOR UPDATE
      `;
      if (!locked.length) throw new BackdatedPurchaseError("Belanja terdahulu tidak ditemukan.", 404);

      const existing = await tx.expenseCorrection.findUnique({ where: requestKey });
      if (existing) return replay(existing);

      const preview = await prepare(tx, input, actor, now);
      if (preview.version !== input.version) {
        throw new BackdatedPurchaseError("Data berubah sejak pratinjau. Tinjau kembali koreksi ini.", 409);
      }
      if (preview.blockers.length) throw new BackdatedPurchaseError(preview.blockers[0].message, 409);

      const { before, after } = preview.impact;
      const paymentId = preview.subject.payment?.id;
      const audit = await tx.expenseCorrection.create({
        data: {
          storeId: actor.storeId, requestId: input.requestId, actorId: actor.id, actorName: actor.name ?? actor.id,
          action: input.operation === "edit" ? "EDIT" : "CANCEL",
          subjectKind: preview.subject.type, subjectId: purchaseId,
          paymentKind: preview.subject.payment?.kind, paymentId,
          reason: input.draft.reason, inputHash, version: input.version, before, after,
          settlements: { create: input.draft.dispositions.map(settlementData) },
        },
        select: { id: true },
      });

      if (paymentId) {
        const edited = after.payments.find(payment => payment.id === paymentId);
        await tx.backdatedPurchasePayment.update({
          where: { id: paymentId, purchaseId },
          data: edited ? { amount: decimal(edited.amountCents), paidAt: utcDate(edited.paidAt) } : { cancelledAt: now },
        });
      } else {
        await tx.backdatedPurchase.update({
          where: { id: purchaseId, storeId: actor.storeId },
          data: after.cancelled ? { cancelledAt: now } : {
            reference: after.reference, purchaseDate: utcDate(after.purchaseDate),
            dueDate: utcDate(after.dueDate), amount: decimal(after.amountCents),
          },
        });
      }
      await syncBackdatedPurchaseCorrectionExpenses(tx, purchaseId, actor.storeId, now);
      return { auditId: audit.id };
    }, { timeout: 15_000 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const existing = await db.expenseCorrection.findUnique({ where: requestKey });
      if (existing) return replay(existing);
    }
    throw error;
  }
}

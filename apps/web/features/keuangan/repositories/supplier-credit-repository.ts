import { db, type Prisma } from "@pos/db";
import { loadCorrectionPaymentState } from "@/features/suppliers/shopping-requests/repositories/shopping-request-correction-payment-state";

export class SupplierCreditError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 422) { super(message); }
}

const cents = (value: Prisma.Decimal | string) => Math.round(Number(value) * 100);

async function payableBalance(tx: Prisma.TransactionClient, payableId: string, storeId: string) {
  const payable = await tx.supplierPayable.findFirst({
    where: { id: payableId, storeId, goodsPurchase: { status: "APPROVED", supplierId: { not: null } } },
    select: {
      amount: true, giroHistoryVerifiedAt: true, goodsPurchase: { select: { id: true, supplierId: true } },
      creditApplications: { where: { releasedAt: null }, select: { amount: true } },
    },
  });
  if (!payable?.goodsPurchase?.supplierId) throw new SupplierCreditError("Tagihan dengan pemasok yang terverifikasi tidak ditemukan.", 404);
  if (!payable.giroHistoryVerifiedAt) throw new SupplierCreditError("Periksa riwayat giro sebelum memakai kredit.", 409);
  const state = await loadCorrectionPaymentState(tx, { storeId, purchaseId: payable.goodsPurchase.id });
  const applied = payable.creditApplications.reduce((sum, entry) => sum + cents(entry.amount), 0);
  return {
    supplierId: payable.goodsPurchase.supplierId,
    remainingCents: Math.max(0, cents(payable.amount) - cents(state.paid) - applied),
  };
}

export function listPayableSupplierCredits(payableId: string, storeId: string) {
  return db.$transaction(async tx => {
    const payable = await payableBalance(tx, payableId, storeId);
    const entries = await tx.expensePaymentSettlement.findMany({
      where: { kind: "CREDIT", storeId, supplierId: payable.supplierId },
      select: { id: true, reference: true, amount: true, applications: { where: { releasedAt: null }, select: { amount: true } } },
      orderBy: [{ correction: { createdAt: "asc" } }, { id: "asc" }],
    });
    const credits = entries.map(entry => ({
      id: entry.id, reference: entry.reference,
      remainingCents: cents(entry.amount) - entry.applications.reduce((sum, application) => sum + cents(application.amount), 0),
    })).filter(entry => entry.remainingCents > 0);
    return { remainingCents: payable.remainingCents, credits };
  }, { isolationLevel: "RepeatableRead" });
}

export function applyExpenseSupplierCredit(
  input: { payableId: string; creditId: string; amountCents: number; requestId: string },
  actor: { id: string; storeId: string },
) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new SupplierCreditError("Nominal kredit tidak valid.", 422);
  }
  const { storeId } = actor;
  const { payableId, creditId, amountCents, requestId } = input;
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "pos_stores" WHERE "id" = ${storeId} FOR UPDATE`;
    const prior = await tx.expenseSupplierCreditApplication.findUnique({
      where: { storeId_requestId: { storeId, requestId } },
      select: { id: true, payableId: true, creditId: true, amount: true },
    });
    if (prior) {
      if (prior.payableId !== payableId || prior.creditId !== creditId || cents(prior.amount) !== amountCents) {
        throw new SupplierCreditError("Nomor permintaan sudah digunakan untuk kredit yang berbeda.", 409);
      }
      return { applicationId: prior.id };
    }

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      WITH purchase_lock AS MATERIALIZED (
        SELECT g."id" FROM "pos_goods_purchases" g
        JOIN "pos_supplier_payables" d ON d."goodsPurchaseId" = g."id" AND d."storeId" = g."storeId"
        WHERE d."id" = ${payableId} AND d."storeId" = ${storeId} AND g."status" = 'APPROVED'
        FOR UPDATE OF g
      )
      SELECT d."id" FROM "pos_supplier_payables" d JOIN purchase_lock g ON d."goodsPurchaseId" = g."id"
      WHERE d."id" = ${payableId} AND d."storeId" = ${storeId}
      FOR UPDATE OF d
    `;
    if (!locked.length) throw new SupplierCreditError("Tagihan aktif tidak ditemukan.", 404);
    const payable = await payableBalance(tx, payableId, storeId);
    const credit = await tx.expensePaymentSettlement.findFirst({
      where: { id: creditId, storeId, kind: "CREDIT", supplierId: payable.supplierId },
      select: { amount: true, applications: { where: { releasedAt: null }, select: { amount: true } } },
    });
    if (!credit) throw new SupplierCreditError("Kredit pemasok untuk tagihan ini tidak ditemukan.", 404);
    const remainingCredit = cents(credit.amount) - credit.applications.reduce((sum, entry) => sum + cents(entry.amount), 0);
    if (amountCents > Math.min(remainingCredit, payable.remainingCents)) {
      throw new SupplierCreditError("Saldo kredit atau tagihan berubah. Periksa nominal sebelum mencoba lagi.", 409);
    }
    const application = await tx.expenseSupplierCreditApplication.create({
      data: { storeId, payableId, creditId, requestId, actorId: actor.id, amount: (amountCents / 100).toFixed(2) },
      select: { id: true },
    });
    return { applicationId: application.id };
  });
}

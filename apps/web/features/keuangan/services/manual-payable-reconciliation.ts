import { randomUUID } from "node:crypto";
import type { Prisma } from "@pos/db";
import { projectPayableLedger } from "../helpers/payable-ledger";
import { permitSystemPayablePayment } from "./payable-system-payment";

export class ManualPayableReconciliationError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

type LockedDebt = { id: string; amount: string; debtDate: string; dueDate: string | null };
type Scope = { storeId: string; payableId: string; actorId: string; todayWib: string };

/** Caller must keep this transaction open while changing the debt or its payments. */
export async function reconcilePayable(tx: Prisma.TransactionClient, scope: Scope) {
  const [debt] = await tx.$queryRaw<LockedDebt[]>`
    SELECT "id", "amount"::text, "debtDate"::text, "dueDate"::text
    FROM "pos_supplier_payables"
    WHERE "id" = ${scope.payableId} AND "storeId" = ${scope.storeId} AND "goodsPurchaseId" IS NULL
    FOR UPDATE
  `;
  if (!debt) throw new ManualPayableReconciliationError("Hutang manual tidak ditemukan.", 404);
  const stored = await tx.supplierPayablePayment.findMany({ where: { payableId: debt.id },
    select: { id: true, amount: true, paidAt: true, origin: true, transferAllocation: { select: { amount: true } } } });
  const automaticRows = stored.filter(payment => payment.origin === "AUTO");
  if (automaticRows.length > 1) throw new ManualPayableReconciliationError("Riwayat pelunasan otomatis tidak valid.", 409);
  const automatic = automaticRows[0];
  const projection = projectPayableLedger({ payableId: debt.id, amountCents: Math.round(Number(debt.amount) * 100),
    debtDate: debt.debtDate, dueDate: debt.dueDate, todayWib: scope.todayWib,
    payments: stored.filter(payment => payment.origin !== "AUTO").map(payment => ({ id: payment.id,
      amountCents: Math.round(Number(payment.amount) * 100), paidAt: payment.paidAt.toISOString().slice(0, 10), origin: payment.origin })),
  });
  const expected = projection.payments.find(payment => payment.origin === "AUTO");
  if (automatic?.transferAllocation && (!expected
    || Math.round(Number(automatic.transferAllocation.amount) * 100) > expected.amountCents
    || automatic.paidAt.toISOString().slice(0, 10) !== expected.paidAt)) {
    throw new ManualPayableReconciliationError("Perubahan tidak sesuai dengan alokasi transfer. Ubah atau lepaskan alokasi terlebih dahulu.", 409);
  }
  if (!expected) {
    if (automatic) await tx.supplierPayablePayment.delete({ where: { id: automatic.id } });
    return { ...projection, automaticPaymentId: null };
  }
  if (automatic) {
    if (Math.round(Number(automatic.amount) * 100) !== expected.amountCents || automatic.paidAt.toISOString().slice(0, 10) !== expected.paidAt) {
      await tx.supplierPayablePayment.update({ where: { id: automatic.id }, data: { amount: expected.amountCents / 100, paidAt: new Date(`${expected.paidAt}T00:00:00Z`) } });
    }
    return { ...projection, automaticPaymentId: automatic.id };
  }
  const id = randomUUID();
  await permitSystemPayablePayment(tx);
  await tx.supplierPayablePayment.create({ data: { id, payableId: debt.id, amount: expected.amountCents / 100,
    paidAt: new Date(`${expected.paidAt}T00:00:00Z`), origin: "AUTO", automaticKey: `due:${debt.id}`, createdById: scope.actorId } });
  return { ...projection, automaticPaymentId: id };
}

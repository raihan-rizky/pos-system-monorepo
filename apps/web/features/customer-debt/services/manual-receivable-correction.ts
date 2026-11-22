import type { Prisma } from "@pos/db";
import { z } from "zod";
import { MANUAL_RECEIPT_REPORT_CATEGORIES } from "@/features/keuangan/helpers/manual-report-categories";
import { ReceivableError, todayInJakarta } from "../helpers/manual-receivables";

const money = z.number().finite().positive().max(9999999999.99).multipleOf(0.01);
const date = z.iso.date();
const note = z.string().trim().max(500).optional();
export const receivableCorrectionSchema = z.object({ customerId: z.string().trim().min(1).max(200).optional(), amount: money, debtDate: date, dueDate: date, expectedUpdatedAt: z.iso.datetime(),
  reportCategory: z.enum(MANUAL_RECEIPT_REPORT_CATEGORIES), note })
  .refine(value => value.debtDate <= todayInJakarta() && value.dueDate >= value.debtDate, { message: "Periksa tanggal piutang." });
export const receivablePaymentCorrectionSchema = z.object({ amount: money, paidAt: date, expectedUpdatedAt: z.iso.datetime(),
  method: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]), note })
  .refine(value => value.paidAt <= todayInJakarta(), { message: "Tanggal pembayaran tidak boleh melewati hari ini." });
type Actor = { id: string; storeId: string };
type Tx = Prisma.TransactionClient;

async function lockedReceivable(tx: Tx, id: string, storeId: string, targetCustomerId?: string, authorizeCustomerChange?: () => Promise<void>) {
  const identity = await tx.customerReceivable.findFirst({ where: { id, storeId }, select: { customerId: true } });
  if (!identity) throw new ReceivableError("Piutang tidak ditemukan.", 404);
  if (targetCustomerId && targetCustomerId !== identity.customerId) {
    if (!authorizeCustomerChange) throw new ReceivableError("Izin melihat pelanggan diperlukan untuk mengganti pelanggan.", 403);
    await authorizeCustomerChange();
  }
  for (const customerId of [...new Set([identity.customerId, targetCustomerId ?? identity.customerId])].sort()) {
    const customers = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "pos_customers" WHERE "id" = ${customerId} AND "storeId" = ${storeId} FOR UPDATE`;
    if (!customers.length) throw new ReceivableError("Pelanggan tidak ditemukan.", 404);
  }
  const receivable = await tx.customerReceivable.findFirst({ where: { id, storeId }, include: { payments: true } });
  if (!receivable) throw new ReceivableError("Piutang tidak ditemukan.", 404);
  if (receivable.customerId !== identity.customerId) throw new ReceivableError("Pelanggan piutang berubah. Muat ulang dan coba lagi.", 409);
  return receivable;
}
const paymentDate = (payment: { paidAt: Date | null; createdAt: Date }) => payment.paidAt
  ? payment.paidAt.toISOString().slice(0, 10)
  : new Date(payment.createdAt.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function changeCustomerDebt(tx: Tx, customerId: string, storeId: string, deltaCents: number) {
  if (!deltaCents) return;
  const delta = deltaCents / 100;
  const updated = await tx.customer.updateMany({ where: { id: customerId, storeId, ...(delta < 0 ? { totalDebt: { gte: -delta } } : {}) },
    data: { totalDebt: { increment: delta } } });
  if (updated.count !== 1) throw new ReceivableError("Saldo pelanggan berubah. Muat ulang dan coba lagi.", 409);
}

export async function correctReceivable(tx: Tx, id: string, input: z.infer<typeof receivableCorrectionSchema>, actor: Actor, authorizeCustomerChange?: () => Promise<void>) {
  const receivable = await lockedReceivable(tx, id, actor.storeId, input.customerId, authorizeCustomerChange);
  if (receivable.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new ReceivableError("Piutang telah berubah. Muat ulang dan periksa kembali.", 409);
  if (Math.round(input.amount * 100) < Math.round(Number(receivable.amountPaid) * 100)
    || receivable.payments.some(payment => paymentDate(payment) < input.debtDate)) throw new ReceivableError("Nominal atau tanggal piutang tidak sesuai dengan riwayat pembayaran.", 409);
  const destination = input.customerId ?? receivable.customerId;
  const oldAmount = Math.round(Number(receivable.amount) * 100);
  const newAmount = Math.round(input.amount * 100);
  const paid = Math.round(Number(receivable.amountPaid) * 100);
  if (destination === receivable.customerId) await changeCustomerDebt(tx, destination, actor.storeId, newAmount - oldAmount);
  else {
    await changeCustomerDebt(tx, receivable.customerId, actor.storeId, -(oldAmount - paid));
    await changeCustomerDebt(tx, destination, actor.storeId, newAmount - paid);
  }
  const updated = await tx.customerReceivable.updateMany({ where: { id, storeId: actor.storeId, customerId: receivable.customerId, amount: receivable.amount, amountPaid: receivable.amountPaid }, data: {
    customerId: destination, amount: input.amount, debtDate: new Date(`${input.debtDate}T00:00:00Z`), dueDate: new Date(`${input.dueDate}T00:00:00Z`), reportCategory: input.reportCategory, note: input.note || null,
  } });
  if (updated.count !== 1) throw new ReceivableError("Piutang berubah. Muat ulang dan coba lagi.", 409);
}

export async function correctReceivablePayment(tx: Tx, id: string, paymentId: string, input: z.infer<typeof receivablePaymentCorrectionSchema>, actor: Actor) {
  const receivable = await lockedReceivable(tx, id, actor.storeId);
  if (receivable.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new ReceivableError("Piutang telah berubah. Muat ulang dan periksa kembali.", 409);
  const payment = receivable.payments.find(row => row.id === paymentId);
  if (!payment) throw new ReceivableError("Pembayaran piutang tidak ditemukan.", 404);
  const delta = Math.round(input.amount * 100) - Math.round(Number(payment.amount) * 100);
  const paid = Math.round(Number(receivable.amountPaid) * 100) + delta;
  if (input.paidAt < receivable.debtDate.toISOString().slice(0, 10) || paid < 0 || paid > Math.round(Number(receivable.amount) * 100)) {
    throw new ReceivableError("Tanggal atau nominal pembayaran tidak sesuai dengan piutang.", 409);
  }
  await changeCustomerDebt(tx, receivable.customerId, actor.storeId, -delta);
  const updated = await tx.customerReceivable.updateMany({ where: { id, storeId: actor.storeId, amount: receivable.amount, amountPaid: receivable.amountPaid }, data: { amountPaid: { increment: delta / 100 } } });
  if (updated.count !== 1) throw new ReceivableError("Piutang berubah. Muat ulang dan coba lagi.", 409);
  const paymentUpdated = await tx.customerReceivablePayment.updateMany({ where: { id: paymentId, receivableId: id }, data: {
    amount: input.amount, paidAt: new Date(`${input.paidAt}T00:00:00Z`), method: input.method, note: input.note || null,
  } });
  if (paymentUpdated.count !== 1) throw new ReceivableError("Pembayaran piutang tidak ditemukan.", 404);
}

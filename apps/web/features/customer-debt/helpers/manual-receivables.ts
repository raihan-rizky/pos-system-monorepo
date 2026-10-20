import type { Prisma } from "@pos/db";
import { z } from "zod";

const money = z.number().finite().positive("Nominal harus lebih dari 0.").max(9999999999.99, "Nominal terlalu besar.").multipleOf(0.01, "Gunakan maksimal dua angka desimal.");
const date = z.iso.date("Tanggal tidak valid.");
const note = z.string().trim().max(500, "Catatan maksimal 500 karakter.").optional();

export function todayInJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const createReceivableSchema = z.object({
  customerId: z.string().min(1), amount: money, debtDate: date, dueDate: date, note,
  clientMutationId: z.uuid("Permintaan tidak valid. Silakan muat ulang formulir."),
}).refine((value) => value.dueDate >= value.debtDate, { path: ["dueDate"], message: "Tanggal jatuh tempo tidak boleh sebelum tanggal utang." })
  .refine((value) => value.debtDate <= todayInJakarta(), { path: ["debtDate"], message: "Tanggal utang tidak boleh melewati hari ini." });

export const receivablePaymentSchema = z.object({
  amount: money, method: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]), note,
  clientMutationId: z.uuid("Permintaan tidak valid. Silakan muat ulang formulir."),
});

export class ReceivableError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "ReceivableError"; }
}

export const receivableInclude = {
  customer: { select: { id: true, name: true } },
  payments: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.CustomerReceivableInclude;

type Actor = { id: string; storeId: string };
type Tx = Prisma.TransactionClient;

// Share the customer-first lock order with checkout and invoice debt payments.
async function lockCustomer(tx: Tx, customerId: string, storeId: string) {
  await tx.$queryRaw`SELECT "id" FROM "pos_customers" WHERE "id" = ${customerId} AND "storeId" = ${storeId} FOR UPDATE`;
}

export async function createReceivable(tx: Tx, input: z.infer<typeof createReceivableSchema>, actor: Actor) {
  await lockCustomer(tx, input.customerId, actor.storeId);
  const customer = await tx.customer.findFirst({ where: { id: input.customerId, storeId: actor.storeId }, select: { id: true } });
  if (!customer) throw new ReceivableError("Pelanggan tidak ditemukan.", 404);
  const previous = await tx.customerReceivable.findUnique({ where: { clientMutationId: input.clientMutationId }, include: receivableInclude });
  if (previous) {
    if (previous.storeId !== actor.storeId || previous.customerId !== input.customerId || Number(previous.amount) !== input.amount || previous.debtDate.toISOString().slice(0, 10) !== input.debtDate || previous.dueDate.toISOString().slice(0, 10) !== input.dueDate || (previous.note ?? "") !== (input.note ?? "")) {
      throw new ReceivableError("Permintaan sudah digunakan untuk piutang lain. Muat ulang formulir.", 409);
    }
    return previous;
  }
  const receivable = await tx.customerReceivable.create({
    data: { ...input, note: input.note || null, debtDate: new Date(`${input.debtDate}T00:00:00Z`), dueDate: new Date(`${input.dueDate}T00:00:00Z`), storeId: actor.storeId, createdById: actor.id },
    include: receivableInclude,
  });
  await tx.customer.update({ where: { id: customer.id }, data: { totalDebt: { increment: input.amount } } });
  return receivable;
}

export async function payReceivable(tx: Tx, id: string, input: z.infer<typeof receivablePaymentSchema>, actor: Actor) {
  const identity = await tx.customerReceivable.findFirst({ where: { id, storeId: actor.storeId }, select: { customerId: true } });
  if (!identity) throw new ReceivableError("Piutang tidak ditemukan.", 404);
  await lockCustomer(tx, identity.customerId, actor.storeId);
  const receivable = await tx.customerReceivable.findFirst({ where: { id, storeId: actor.storeId }, include: receivableInclude });
  if (!receivable) throw new ReceivableError("Piutang tidak ditemukan.", 404);
  const previous = await tx.customerReceivablePayment.findUnique({ where: { clientMutationId: input.clientMutationId } });
  if (previous) {
    if (previous.receivableId !== id || Number(previous.amount) !== input.amount || previous.method !== input.method || (previous.note ?? "") !== (input.note ?? "")) throw new ReceivableError("Permintaan sudah digunakan untuk pembayaran lain. Muat ulang formulir.", 409);
    return receivable;
  }
  const remainingCents = Math.round(Number(receivable.amount) * 100) - Math.round(Number(receivable.amountPaid) * 100);
  if (Math.round(input.amount * 100) > remainingCents) throw new ReceivableError("Pembayaran melebihi sisa piutang. Muat ulang untuk melihat saldo terbaru.", 409);
  const updated = await tx.customerReceivable.updateMany({
    where: { id, storeId: actor.storeId, amountPaid: receivable.amountPaid, amount: receivable.amount },
    data: { amountPaid: { increment: input.amount } },
  });
  if (updated.count !== 1) throw new ReceivableError("Saldo piutang berubah. Silakan muat ulang dan coba lagi.", 409);
  const customerUpdated = await tx.customer.updateMany({ where: { id: receivable.customerId, storeId: actor.storeId, totalDebt: { gte: input.amount } }, data: { totalDebt: { decrement: input.amount } } });
  if (customerUpdated.count !== 1) throw new ReceivableError("Saldo pelanggan berubah. Silakan muat ulang dan coba lagi.", 409);
  await tx.customerReceivablePayment.create({ data: { ...input, note: input.note || null, receivableId: id, createdById: actor.id } });
  return tx.customerReceivable.findFirst({ where: { id, storeId: actor.storeId }, include: receivableInclude });
}
